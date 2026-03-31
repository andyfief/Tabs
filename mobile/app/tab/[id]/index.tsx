import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect, useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { apiFetch } from '../../../utils/api';
import { HARDCODED_USER_ID } from '../../../utils/constants';

// ─── Types ───────────────────────────────────────────────────

type Member = { user_id: string; display_name: string };

type TabDetail = {
  id: string;
  name: string;
  description: string | null;
  status: 'open' | 'closed';
  members: Member[];
};

type Expense = {
  id: string;
  title: string;
  amount: number;
  payer_name: string;
  created_at: string;
  removed_at: string | null;
};

type Balance = {
  user_a_id: string;
  user_a_name: string;
  user_b_id: string;
  user_b_name: string;
  net_balance: number;
};

type MyBalance = {
  counterpart_id: string;
  counterpart_name: string;
  amount: number;
  i_owe: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────

function toMyBalances(balances: Balance[], myId: string): MyBalance[] {
  const result: MyBalance[] = [];
  for (const b of balances) {
    if (b.net_balance === 0) continue;
    if (b.user_a_id === myId) {
      result.push({
        counterpart_id: b.user_b_id,
        counterpart_name: b.user_b_name,
        amount: Math.abs(b.net_balance),
        i_owe: b.net_balance > 0,
      });
    } else if (b.user_b_id === myId) {
      result.push({
        counterpart_id: b.user_a_id,
        counterpart_name: b.user_a_name,
        amount: Math.abs(b.net_balance),
        i_owe: b.net_balance < 0,
      });
    }
  }
  return result;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Swipeable expense row ────────────────────────────────────

type ExpenseRowProps = {
  item: Expense;
  onToggle: (id: string) => void;
};

function ExpenseRow({ item, onToggle }: ExpenseRowProps) {
  const removed = item.removed_at !== null;

  const renderRightAction = () => (
    <Pressable
      style={[styles.swipeAction, removed ? styles.swipeRestore : styles.swipeRemove]}
      onPress={() => onToggle(item.id)}
    >
      <Text style={styles.swipeLabel}>{removed ? 'Restore' : 'Remove'}</Text>
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightAction} overshootRight={false}>
      <View style={[styles.expenseRow, removed && styles.expenseRowRemoved]}>
        <View style={styles.expenseLeft}>
          <Text style={[styles.expenseTitle, removed && styles.textRemoved]}>
            {item.title}
          </Text>
          <Text style={[styles.expenseMeta, removed && styles.textRemoved]}>
            Paid by {item.payer_name} · {formatDate(item.created_at)}
            {removed ? '  · removed' : ''}
          </Text>
        </View>
        <Text style={[styles.expenseAmount, removed && styles.textRemoved]}>
          ${item.amount.toFixed(2)}
        </Text>
      </View>
    </Swipeable>
  );
}

// ─── Screen ──────────────────────────────────────────────────

type Panel = 'expenses' | 'balances';

export default function TabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [tab, setTab] = useState<TabDetail | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [panel, setPanel] = useState<Panel>('expenses');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const [tabData, expenseData, balanceData] = await Promise.all([
        apiFetch<TabDetail>(`/tabs/${id}`),
        apiFetch<Expense[]>(`/tabs/${id}/expenses`),
        apiFetch<Balance[]>(`/tabs/${id}/expenses/balances`),
      ]);
      setTab(tabData);
      setExpenses(expenseData);
      setBalances(balanceData);
      navigation.setOptions({ title: tabData.name });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tab.');
    }
  }, [id, navigation]);

  useEffect(() => {
    fetchAll().finally(() => {
      setLoading(false);
      initialized.current = true;
    });
  }, [fetchAll]);

  useFocusEffect(
    useCallback(() => {
      if (!initialized.current) return;
      setRefreshing(true);
      fetchAll().finally(() => setRefreshing(false));
    }, [fetchAll])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll().finally(() => setRefreshing(false));
  }, [fetchAll]);

  // Optimistic toggle: flip removed_at locally, then persist, then refetch balances
  const handleToggleExpense = useCallback(async (expenseId: string) => {
    const now = new Date().toISOString();

    setExpenses((prev) => {
      const toggled = prev.map((e) =>
        e.id === expenseId
          ? { ...e, removed_at: e.removed_at === null ? now : null }
          : e
      );
      // Re-sort: active first by created_at desc, removed last by removed_at desc
      const active = toggled.filter((e) => e.removed_at === null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const removed = toggled.filter((e) => e.removed_at !== null)
        .sort((a, b) => b.removed_at!.localeCompare(a.removed_at!));
      return [...active, ...removed];
    });

    try {
      await apiFetch(`/tabs/${id}/expenses/${expenseId}`, { method: 'PATCH' });
      // Refetch balances so My Balances panel stays in sync
      const balanceData = await apiFetch<Balance[]>(`/tabs/${id}/expenses/balances`);
      setBalances(balanceData);
    } catch (e: unknown) {
      // Revert optimistic update on failure
      fetchAll();
    }
  }, [id, fetchAll]);

  // ── Loading / error states ──────────────────────────────────

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  if (error || !tab) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Tab not found.'}</Text>
      </View>
    );
  }

  const myBalances = toMyBalances(balances, HARDCODED_USER_ID);
  const iOwe = myBalances.filter((b) => b.i_owe);
  const owedToMe = myBalances.filter((b) => !b.i_owe);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.tabName}>{tab.name}</Text>
        {tab.description ? <Text style={styles.description}>{tab.description}</Text> : null}
        <Text style={styles.meta}>
          {tab.members.length} {tab.members.length === 1 ? 'member' : 'members'} · {tab.status}
        </Text>
      </View>

      {/* Toggle */}
      <View style={styles.toggle}>
        <Pressable
          style={[styles.toggleBtn, panel === 'expenses' && styles.toggleActive]}
          onPress={() => setPanel('expenses')}
        >
          <Text style={[styles.toggleLabel, panel === 'expenses' && styles.toggleLabelActive]}>
            Expenses
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, panel === 'balances' && styles.toggleActive]}
          onPress={() => setPanel('balances')}
        >
          <Text style={[styles.toggleLabel, panel === 'balances' && styles.toggleLabelActive]}>
            My Balances
          </Text>
        </Pressable>
      </View>

      {/* Expenses panel */}
      {panel === 'expenses' && (
        <>
          <Pressable
            style={styles.addBtn}
            onPress={() => router.push(`/tab/${id}/add-expense`)}
          >
            <Text style={styles.addBtnLabel}>+ Add Expense</Text>
          </Pressable>
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <ExpenseRow item={item} onToggle={handleToggleExpense} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No expenses yet.</Text>
              </View>
            }
          />
        </>
      )}

      {/* My Balances panel */}
      {panel === 'balances' && (
        <FlatList
          data={[]}
          keyExtractor={() => ''}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            myBalances.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>You're all settled up.</Text>
              </View>
            ) : (
              <>
                {iOwe.length > 0 && (
                  <>
                    <Text style={styles.balanceSection}>You owe</Text>
                    {iOwe.map((b) => (
                      <View key={b.counterpart_id} style={styles.balanceRow}>
                        <Text style={styles.balanceName}>{b.counterpart_name}</Text>
                        <Text style={[styles.balanceAmount, styles.owe]}>
                          −${b.amount.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
                {owedToMe.length > 0 && (
                  <>
                    <Text style={styles.balanceSection}>Owed to you</Text>
                    {owedToMe.map((b) => (
                      <View key={b.counterpart_id} style={styles.balanceRow}>
                        <Text style={styles.balanceName}>{b.counterpart_name}</Text>
                        <Text style={[styles.balanceAmount, styles.owed]}>
                          +${b.amount.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </>
            )
          }
          renderItem={() => null}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  tabName: { fontSize: 20, fontWeight: '700' },
  description: { fontSize: 14, color: '#555', marginTop: 3 },
  meta: { fontSize: 12, color: '#999', marginTop: 4 },

  toggle: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  toggleActive: { borderBottomWidth: 2, borderColor: '#000' },
  toggleLabel: { fontSize: 14, color: '#999' },
  toggleLabelActive: { color: '#000', fontWeight: '600' },

  addBtn: { margin: 12, padding: 12, backgroundColor: '#000', borderRadius: 7, alignItems: 'center' },
  addBtnLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  expenseRowRemoved: { backgroundColor: '#fafafa' },
  expenseLeft: { flex: 1, marginRight: 12 },
  expenseTitle: { fontSize: 15, fontWeight: '500' },
  expenseMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  expenseAmount: { fontSize: 15, fontWeight: '600' },
  textRemoved: { color: '#bbb' },

  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
  },
  swipeRemove: { backgroundColor: '#c0392b' },
  swipeRestore: { backgroundColor: '#27ae60' },
  swipeLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  balanceSection: {
    fontSize: 12, fontWeight: '600', color: '#999',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  balanceRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee',
  },
  balanceName: { fontSize: 15 },
  balanceAmount: { fontSize: 15, fontWeight: '600' },
  owe: { color: '#c0392b' },
  owed: { color: '#27ae60' },

  emptyState: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14 },
  error: { color: 'red', fontSize: 14, textAlign: 'center', padding: 16 },
});
