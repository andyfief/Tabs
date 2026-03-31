import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
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
import { buildVenmoLink, buildCashAppLink } from '../../../utils/paymentLinks';
import type { Expense, TabDetailFull, BalanceSettlement } from '../../../utils/tabQueries';
import { useSession } from '../../../hooks/useSession';

const DARK_BG = '#1c1c1e';
const DARK_CARD = '#2c2c2e';
const DARK_BORDER = '#3a3a3c';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const VENMO_ICON = require('../../../assets/venmo.png') as number;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CASHAPP_ICON = require('../../../assets/cashapp.png') as number;

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

// ─── Payment icons ────────────────────────────────────────────

type PaymentIconsProps = {
  venmoHandle: string | null;
  cashappHandle: string | null;
  unlocked: boolean;
  onSettle: (platform: 'venmo' | 'cashapp', handle: string) => void;
};

function PaymentIcons({
  venmoHandle,
  cashappHandle,
  unlocked,
  onSettle,
}: PaymentIconsProps) {
  if (!venmoHandle && !cashappHandle) return null;

  return (
    <View style={styles.paymentIcons}>
      {venmoHandle && (
        <Pressable
          onPress={unlocked ? () => onSettle('venmo', venmoHandle) : undefined}
          style={styles.iconBtn}
        >
          <Image
            source={VENMO_ICON}
            style={[styles.iconImg, !unlocked && styles.iconDisabled]}
          />
        </Pressable>
      )}
      {cashappHandle && (
        <Pressable
          onPress={unlocked ? () => onSettle('cashapp', cashappHandle) : undefined}
          style={styles.iconBtn}
        >
          <Image
            source={CASHAPP_ICON}
            style={[styles.iconImg, !unlocked && styles.iconDisabled]}
          />
        </Pressable>
      )}
    </View>
  );
}

// ─── Settled balance row (swipeable to restore) ───────────────

type SettledRowProps = {
  item: BalanceSettlement;
  onRestore: (id: string) => void;
};

function SettledRow({ item, onRestore }: SettledRowProps) {
  const renderRightAction = () => (
    <Pressable style={[styles.swipeAction, styles.swipeRestore]} onPress={() => onRestore(item.id)}>
      <Text style={styles.swipeLabel}>Restore</Text>
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightAction} overshootRight={false}>
      <View style={[styles.balanceRow, styles.balanceRowSettled]}>
        <View style={styles.balanceLeft}>
          <Text style={[styles.balanceName, styles.textSettled]}>{item.counterpart_name}</Text>
          <Text style={styles.settledMeta}>Settled {formatDate(item.settled_at)}</Text>
        </View>
        <Text style={[styles.balanceAmount, styles.textSettled]}>
          {item.i_owe ? '−' : '+'}${item.amount.toFixed(2)}
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

  // links_unlocked is one-way: once true from the server it stays true.
  // Local state lets us optimistically flip it without a full refetch.
  const serverLinksUnlocked = data?.tab.links_unlocked ?? false;
  const [linksUnlocked, setLinksUnlocked] = useState(serverLinksUnlocked);
  useEffect(() => {
    if (serverLinksUnlocked) setLinksUnlocked(true);
  }, [serverLinksUnlocked]);

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

  useEffect(() => {
    if (!isFetching) setRefreshing(false);
  }, [isFetching]);

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
      queryClient.invalidateQueries({ queryKey: ['tab', id] });
    } catch {
      queryClient.invalidateQueries({ queryKey: ['tab', id] });
    }
  }, [id]);

  // ── Balance link unlock ───────────────────────────────────
  const handleUnlock = useCallback(async () => {
    setLinksUnlocked(true);
    try {
      await apiFetch(`/tabs/${id}/unlock-balance-links`, { method: 'POST' });
    } catch {
      setLinksUnlocked(false);
      Alert.alert('Error', 'Could not unlock balance links.');
    }
  }, [id]);

  // ── Settle a balance (open payment link + record settlement) ─
  const handleSettle = useCallback(async (
    counterpartId: string,
    counterpartName: string,
    amount: number,
    iOwe: boolean,
    platform: 'venmo' | 'cashapp',
    handle: string,
  ) => {
    const tabName = data?.tab.name ?? '';
    const url = platform === 'venmo'
      ? buildVenmoLink(handle, amount, tabName)
      : buildCashAppLink(handle, amount, tabName);

    Linking.openURL(url).catch(() =>
      Alert.alert('Error', `Could not open ${platform === 'venmo' ? 'Venmo' : 'Cash App'}.`)
    );

    // Optimistically add settlement to cache.
    const tempId = `temp-${Date.now()}`;
    const optimistic: BalanceSettlement = {
      id: tempId,
      counterpart_id: counterpartId,
      counterpart_name: counterpartName,
      amount,
      i_owe: iOwe,
      settled_at: new Date().toISOString(),
      restored_at: null,
    };
    queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
      if (!old) return old;
      return { ...old, settlements: [...old.settlements, optimistic] };
    });

    try {
      const result = await apiFetch<BalanceSettlement>(`/tabs/${id}/balance-settlements`, {
        method: 'POST',
        body: JSON.stringify({ counterpart_id: counterpartId, amount, i_owe: iOwe }),
      });
      queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
        if (!old) return old;
        return {
          ...old,
          settlements: old.settlements.map((s) => (s.id === tempId ? result : s)),
        };
      });
    } catch {
      queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
        if (!old) return old;
        return { ...old, settlements: old.settlements.filter((s) => s.id !== tempId) };
      });
    }
  }, [id, data?.tab.name]);

  // ── Restore a settled balance (swipe action on settled rows) ─
  const handleRestore = useCallback(async (settlementId: string) => {
    const now = new Date().toISOString();
    queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
      if (!old) return old;
      return {
        ...old,
        settlements: old.settlements.map((s) =>
          s.id === settlementId ? { ...s, restored_at: now } : s
        ),
      };
    });

    try {
      await apiFetch(`/tabs/${id}/balance-settlements/${settlementId}/restore`, { method: 'PATCH' });
    } catch {
      queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
        if (!old) return old;
        return {
          ...old,
          settlements: old.settlements.map((s) =>
            s.id === settlementId ? { ...s, restored_at: null } : s
          ),
        };
      });
    }
  }, [id]);

  // ── Re-settle a previously-restored balance (payment click on "previously settled" rows) ─
  // Clears restored_at → moves the row back to the settled section without creating a new record.
  const handleReSettle = useCallback(async (
    settlementId: string,
    amount: number,
    platform: 'venmo' | 'cashapp',
    handle: string,
  ) => {
    const tabName = data?.tab.name ?? '';
    const url = platform === 'venmo'
      ? buildVenmoLink(handle, amount, tabName)
      : buildCashAppLink(handle, amount, tabName);

    Linking.openURL(url).catch(() =>
      Alert.alert('Error', `Could not open ${platform === 'venmo' ? 'Venmo' : 'Cash App'}.`)
    );

    // Optimistically clear restored_at (moves row back to settled section).
    queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
      if (!old) return old;
      return {
        ...old,
        settlements: old.settlements.map((s) =>
          s.id === settlementId ? { ...s, restored_at: null } : s
        ),
      };
    });

    try {
      await apiFetch(`/tabs/${id}/balance-settlements/${settlementId}/resettle`, { method: 'PATCH' });
    } catch {
      // Revert: put it back in the active section.
      const now = new Date().toISOString();
      queryClient.setQueryData<TabDetailFull>(['tab', id], (old) => {
        if (!old) return old;
        return {
          ...old,
          settlements: old.settlements.map((s) =>
            s.id === settlementId ? { ...s, restored_at: now } : s
          ),
        };
      });
    }
  }, [id, data?.tab.name]);

  // ── Loading / error states ────────────────────────────────

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

  const { tab, expenses, balances, settlements } = data;
  const myBalances = toMyBalances(balances, userId ?? '');
  const memberMap = Object.fromEntries(tab.members.map((m) => [m.user_id, m]));

  // ── Balance display computation ───────────────────────────
  //
  // outstanding = viewAmount - sum(ALL settlements for this counterpart)
  // This means: settled amounts subtract from the view total regardless of
  // whether they've been restored. Restored settlements each show as their own
  // active row so the per-counterpart totals still reconcile.

  function totalSettledFor(counterpartId: string): number {
    return settlements
      .filter((s) => s.counterpart_id === counterpartId)
      .reduce((sum, s) => sum + s.amount, 0);
  }

  // Active outstanding rows (one per counterpart where net > $0.005).
  const outstandingBalances = myBalances
    .map((b) => ({
      ...b,
      outstanding: Math.max(0, b.amount - totalSettledFor(b.counterpart_id)),
    }))
    .filter((b) => b.outstanding > 0.005);

  const outstandingIOwe = outstandingBalances.filter((b) => b.i_owe);
  const outstandingOwedToMe = outstandingBalances.filter((b) => !b.i_owe);

  // Restored settlements — each is its own active row.
  const restoredSettlements = settlements.filter((s) => s.restored_at !== null);
  const restoredIOwe = restoredSettlements.filter((s) => s.i_owe);
  const restoredOwedToMe = restoredSettlements.filter((s) => !s.i_owe);

  // Non-restored settlements — shown greyed at the bottom.
  const settledItems = settlements
    .filter((s) => s.restored_at === null)
    .sort((a, b) => b.settled_at.localeCompare(a.settled_at));

  const hasAnyActiveBalance =
    outstandingBalances.length > 0 || restoredSettlements.length > 0;
  const hasAnything = hasAnyActiveBalance || settledItems.length > 0;

  // ─── Active balance row renderer ────────────────────────────

  type ActiveRowConfig = {
    key: string;
    counterpart_id: string;
    counterpart_name: string;
    amount: number;
    i_owe: boolean;
    previously_settled: boolean;
    // Set only for previously-settled rows — used to re-settle on payment.
    settlement_id?: string;
  };

  function renderActiveRow(cfg: ActiveRowConfig) {
    const member = memberMap[cfg.counterpart_id];
    const venmoHandle = member?.venmo_handle ?? null;
    const cashappHandle = member?.cashapp_handle ?? null;

    return (
      <View key={cfg.key} style={styles.balanceRow}>
        <View style={styles.balanceLeft}>
          <Text style={styles.balanceName}>{cfg.counterpart_name}</Text>
          {cfg.previously_settled && (
            <Text style={styles.previouslySettledTag}>previously settled</Text>
          )}
        </View>
        <View style={styles.balanceRight}>
          <Text style={[styles.balanceAmount, cfg.i_owe ? styles.owe : styles.owed]}>
            {cfg.i_owe ? '−' : '+'}${cfg.amount.toFixed(2)}
          </Text>
          <PaymentIcons
            venmoHandle={venmoHandle}
            cashappHandle={cashappHandle}
            unlocked={linksUnlocked}
            onSettle={(platform, handle) =>
              cfg.previously_settled && cfg.settlement_id
                ? handleReSettle(cfg.settlement_id, cfg.amount, platform, handle)
                : handleSettle(cfg.counterpart_id, cfg.counterpart_name, cfg.amount, cfg.i_owe, platform, handle)
            }
          />
        </View>
      </View>
    );
  }

  // ─── Balances panel header ───────────────────────────────────

  const balancesHeader = !hasAnything ? (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>You're all settled up.</Text>
    </View>
  ) : (
    <>
      {/* You owe section */}
      {(outstandingIOwe.length > 0 || restoredIOwe.length > 0) && (
        <>
          <Text style={styles.balanceSection}>You owe</Text>
          {outstandingIOwe.map((b) =>
            renderActiveRow({
              key: b.counterpart_id,
              counterpart_id: b.counterpart_id,
              counterpart_name: b.counterpart_name,
              amount: b.outstanding,
              i_owe: true,
              previously_settled: false,
            })
          )}
          {restoredIOwe.map((s) =>
            renderActiveRow({
              key: `restored-${s.id}`,
              counterpart_id: s.counterpart_id,
              counterpart_name: s.counterpart_name,
              amount: s.amount,
              i_owe: true,
              previously_settled: true,
              settlement_id: s.id,
            })
          )}
        </>
      )}

      {/* Owed to you section */}
      {(outstandingOwedToMe.length > 0 || restoredOwedToMe.length > 0) && (
        <>
          <Text style={styles.balanceSection}>Owed to you</Text>
          {outstandingOwedToMe.map((b) =>
            renderActiveRow({
              key: b.counterpart_id,
              counterpart_id: b.counterpart_id,
              counterpart_name: b.counterpart_name,
              amount: b.outstanding,
              i_owe: false,
              previously_settled: false,
            })
          )}
          {restoredOwedToMe.map((s) =>
            renderActiveRow({
              key: `restored-${s.id}`,
              counterpart_id: s.counterpart_id,
              counterpart_name: s.counterpart_name,
              amount: s.amount,
              i_owe: false,
              previously_settled: true,
              settlement_id: s.id,
            })
          )}
        </>
      )}

      {/* Settled section header (rows rendered via FlatList data) */}
      {settledItems.length > 0 && (
        <Text style={styles.balanceSection}>Settled</Text>
      )}
    </>
  );

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
        <View style={styles.balancesPanel}>
          <FlatList
            data={settledItems}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
            ListHeaderComponent={balancesHeader}
            renderItem={({ item }) => (
              <SettledRow item={item} onRestore={handleRestore} />
            )}
          />
          {!linksUnlocked && hasAnything && (
            <Pressable style={styles.unlockBtn} onPress={handleUnlock}>
              <Text style={styles.unlockBtnLabel}>Close My Balances</Text>
            </Pressable>
          )}
        </View>
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

  // ── Balances ──────────────────────────────────────────────

  balancesPanel: { flex: 1 },

  balanceSection: {
    fontSize: 12, fontWeight: '600', color: '#8e8e93',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    backgroundColor: DARK_CARD,
  },
  balanceRowSettled: { backgroundColor: '#242426' },
  balanceLeft: { flex: 1, marginRight: 12 },
  balanceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceName: { fontSize: 15, color: '#fff' },
  balanceAmount: { fontSize: 15, fontWeight: '600' },
  owe: { color: '#ff453a' },
  owed: { color: '#30d158' },
  textSettled: { color: '#555' },
  settledMeta: { fontSize: 11, color: '#555', marginTop: 2 },
  previouslySettledTag: { fontSize: 11, color: '#8e8e93', marginTop: 2 },

  paymentIcons: { flexDirection: 'row', gap: 6 },
  iconBtn: { padding: 2 },
  iconImg: { width: 26, height: 26, resizeMode: 'contain' },
  iconDisabled: { opacity: 0.3 },

  unlockBtn: {
    margin: 12,
    padding: 14,
    backgroundColor: DARK_BORDER,
    borderRadius: 7,
    alignItems: 'center',
  },
  unlockBtnLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  emptyState: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#8e8e93', fontSize: 14 },
  error: { color: '#ff453a', fontSize: 14, textAlign: 'center', padding: 16 },
});
