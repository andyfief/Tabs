import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect, useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../utils/api';
import { queryClient, TAB_DETAIL_STALE_TIME } from '../../../utils/queryClient';
import { fetchTabDetail } from '../../../utils/tabQueries';
import type { Expense, TabDetailFull } from '../../../utils/tabQueries';
import { useSession } from '../../../hooks/useSession';

const DARK_BG = '#1c1c1e';
const DARK_CARD = '#2c2c2e';
const DARK_BORDER = '#3a3a3c';

// ─── Types ───────────────────────────────────────────────────

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
  const { userId } = useSession();
  const [panel, setPanel] = useState<Panel>('expenses');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['tab', id],
    queryFn: () => fetchTabDetail(id!),
    staleTime: TAB_DETAIL_STALE_TIME,
    enabled: !!id,
  });

  // Update header once tab name is available from cache or fresh fetch.
  const handleShowInvite = useCallback(async () => {
    try {
      const { code } = await apiFetch<{ code: string; tab_name: string }>(`/tabs/${id}/invite`);
      Alert.alert(
        'Invite Code',
        `Share this code with anyone you want to add:\n\n${code}`,
        [
          { text: 'Copy Code', onPress: () => Clipboard.setStringAsync(code) },
          { text: 'Done', style: 'cancel' },
        ]
      );
    } catch {
      Alert.alert('Error', 'Could not load invite code.');
    }
  }, [id]);

  useEffect(() => {
    if (!data?.tab) return;
    navigation.setOptions({
      title: data.tab.name,
      headerRight: () => (
        <Pressable onPress={handleShowInvite} style={{ paddingLeft: 6, paddingRight: 4, paddingVertical: 4 }}>
          <Text style={{ color: '#ffffff', fontSize: 15 }}>Invite</Text>
        </Pressable>
      ),
    });
  }, [data?.tab.name, navigation, handleShowInvite]);

  // Clear the pull-to-refresh spinner once the in-flight fetch settles.
  useEffect(() => {
    if (!isFetching) setRefreshing(false);
  }, [isFetching]);

  // Refetch on every focus so data stays current after adding expenses.
  // React Query deduplicates if a fetch is already in flight.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  // Optimistic toggle: update the cache immediately, then sync from the server.
  const handleToggleExpense = useCallback(async (expenseId: string) => {
    const now = new Date().toISOString();

    queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
      if (!old) return old;
      const toggled = old.expenses.map((e) =>
        e.id === expenseId
          ? { ...e, removed_at: e.removed_at === null ? now : null }
          : e
      );
      const active = toggled
        .filter((e) => e.removed_at === null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const removed = toggled
        .filter((e) => e.removed_at !== null)
        .sort((a, b) => b.removed_at!.localeCompare(a.removed_at!));
      return { ...old, expenses: [...active, ...removed] };
    });

    try {
      await apiFetch(`/tabs/${id}/expenses/${expenseId}`, { method: 'PATCH' });
      // Invalidate to pull fresh balances from the pairwise_balances view.
      queryClient.invalidateQueries({ queryKey: ['tab', id] });
    } catch {
      // Revert optimistic update by fetching the source of truth.
      queryClient.invalidateQueries({ queryKey: ['tab', id] });
    }
  }, [id]);

  // ── Loading / error states ──────────────────────────────────
  // Only show a full-screen spinner on the very first load (no cached data).

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;
  }

  if (error || !data?.tab) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          {error instanceof Error ? error.message : 'Tab not found.'}
        </Text>
      </View>
    );
  }

  const { tab, expenses, balances } = data;
  const myBalances = toMyBalances(balances, userId ?? '');
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
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
  container: { flex: 1, backgroundColor: DARK_BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: DARK_BORDER },
  tabName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  description: { fontSize: 14, color: '#8e8e93', marginTop: 3 },
  meta: { fontSize: 12, color: '#8e8e93', marginTop: 4 },

  toggle: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: DARK_BORDER },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  toggleActive: { borderBottomWidth: 2, borderColor: '#fff' },
  toggleLabel: { fontSize: 14, color: '#8e8e93' },
  toggleLabelActive: { color: '#fff', fontWeight: '600' },

  addBtn: { margin: 12, padding: 12, backgroundColor: DARK_BORDER, borderRadius: 7, alignItems: 'center' },
  addBtnLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    backgroundColor: DARK_CARD,
  },
  expenseRowRemoved: { backgroundColor: '#242426' },
  expenseLeft: { flex: 1, marginRight: 12 },
  expenseTitle: { fontSize: 15, fontWeight: '500', color: '#fff' },
  expenseMeta: { fontSize: 12, color: '#8e8e93', marginTop: 2 },
  expenseAmount: { fontSize: 15, fontWeight: '600', color: '#fff' },
  textRemoved: { color: '#555' },

  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
  },
  swipeRemove: { backgroundColor: '#c0392b' },
  swipeRestore: { backgroundColor: '#30d158' },
  swipeLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  balanceSection: {
    fontSize: 12, fontWeight: '600', color: '#8e8e93',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  balanceRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: DARK_BORDER,
  },
  balanceName: { fontSize: 15, color: '#fff' },
  balanceAmount: { fontSize: 15, fontWeight: '600' },
  owe: { color: '#ff453a' },
  owed: { color: '#30d158' },

  emptyState: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#8e8e93', fontSize: 14 },
  error: { color: '#ff453a', fontSize: 14, textAlign: 'center', padding: 16 },
});
