import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { SwipeToActionRow } from '../../../components/SwipeToActionRow';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../utils/api';
import { queryClient } from '../../../utils/queryClient';
import { fetchTabDetail } from '../../../utils/tabQueries';
import { buildVenmoLink, buildCashAppLink } from '../../../utils/paymentLinks';
import type { Expense, Tab, TabDetailFull, BalanceSettlement } from '../../../utils/tabQueries';
import { useSession } from '../../../hooks/useSession';
import {
  useToggleExpense,
  useUnlockLinks,
  useCreateSettlement,
  useRestoreSettlement,
  useReSettleBalance,
} from '../../../hooks/useTabMutations';

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

// ─── Expense row ─────────────────────────────────────────────

type ExpenseRowProps = {
  item: Expense;
  onToggle: (id: string) => void;
};

function ExpenseRow({ item, onToggle }: ExpenseRowProps) {
  const removed = item.removed_at !== null;

  return (
    <SwipeToActionRow
      label={removed ? 'Restore' : 'Remove'}
      activeColor={removed ? '#30d158' : '#c0392b'}
      dimColor={removed ? '#0d2a15' : '#2a0d0d'}
      disappears={false}
      onAction={() => onToggle(item.id)}
      onCommit={() => {}}
    >
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
    </SwipeToActionRow>
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
          android_ripple={null}
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
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
          android_ripple={null}
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
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
  onAction: (id: string) => void;
  onCommit: (id: string) => void;
};

function SettledRow({ item, onAction, onCommit }: SettledRowProps) {
  return (
    <SwipeToActionRow
      label="Restore"
      activeColor="#30d158"
      dimColor="#0d2a15"
      disappears={true}
      onAction={() => onAction(item.id)}
      onCommit={() => onCommit(item.id)}
    >
      <View style={[styles.balanceRow, styles.balanceRowSettled]}>
        <View style={styles.balanceLeft}>
          <Text style={[styles.balanceName, styles.textSettled]}>{item.counterpart_name}</Text>
          <Text style={styles.settledMeta}>Settled by {item.initiator_name}</Text>
        </View>
        <Text style={[styles.balanceAmount, styles.textSettled]}>
          {item.i_owe ? '−' : '+'}${item.amount.toFixed(2)}
        </Text>
      </View>
    </SwipeToActionRow>
  );
}

// ─── Screen ──────────────────────────────────────────────────

type Panel = 'expenses' | 'balances';

export default function TabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();
  const [panel, setPanel] = useState<Panel>('expenses');
  const [refreshing, setRefreshing] = useState(false);

  // Don't hit the network for optimistic temp tabs — reads from seeded cache only.
  const isTemp = id?.startsWith('temp-') ?? false;

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['tab', id],
    queryFn: () => fetchTabDetail(id!),
    enabled: !!id && !isTemp,
  });

  const toggleExpense = useToggleExpense(id!);
  const unlockLinks = useUnlockLinks(id!);
  const createSettlement = useCreateSettlement(id!);
  const restoreSettlement = useRestoreSettlement(id!);
  const reSettleBalance = useReSettleBalance(id!);

  // Watch for the POST to resolve the temp ID, then silently swap the route param in-place.
  // router.setParams updates the URL without triggering a navigation animation.
  useEffect(() => {
    if (!isTemp || !id) return;

    const apply = (realId: string) => {
      router.setParams({ id: realId });
    };

    const existing = queryClient.getQueryData<string>(['tab-resolve', id]);
    if (existing) { apply(existing); return; }

    return queryClient.getQueryCache().subscribe(() => {
      const realId = queryClient.getQueryData<string>(['tab-resolve', id]);
      if (realId) apply(realId);
    });
  }, [id, isTemp, router]);

  const linksUnlocked = data?.tab.links_unlocked ?? false;

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

  const handleLeaveTab = useCallback(() => {
    Alert.alert(
      'Leave Tab',
      'Are you sure you want to leave this tab? You will be removed from the member list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            // Save the tab entry now so we can restore it if the DELETE fails.
            const prevTabs = queryClient.getQueryData<Tab[]>(['tabs']) ?? [];
            const removedTab = prevTabs.find((t) => t.id === id);

            // Optimistically remove from home screen and navigate away immediately.
            queryClient.setQueryData<Tab[]>(['tabs'], (prev = []) =>
              prev.filter((t) => t.id !== id)
            );
            router.back();

            apiFetch(`/tabs/${id}/members/me`, { method: 'DELETE' })
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ['tabs'] });
              })
              .catch(() => {
                // Restore the tab row on the home screen — but don't re-open the tab.
                if (removedTab) {
                  queryClient.setQueryData<Tab[]>(['tabs'], (prev = []) => [
                    ...prev,
                    removedTab,
                  ]);
                } else {
                  queryClient.invalidateQueries({ queryKey: ['tabs'] });
                }
                Alert.alert('Error', 'Could not leave the tab.');
              });
          },
        },
      ]
    );
  }, [id, router]);


  useEffect(() => {
    if (!isFetching) setRefreshing(false);
  }, [isFetching]);

  // isTempRef lets the callback read the current value without being in the dep array.
  // If isTemp were a dep, re-registering the callback when it flips false would cause
  // an immediate re-fire on the already-focused screen, doubling the fetch.
  const isTempRef = useRef(isTemp);
  isTempRef.current = isTemp;

  useFocusEffect(
    useCallback(() => {
      if (isTempRef.current) return;
      // If an optimistic expense is pending (POST still in flight), skip the refetch —
      // the POST handler's invalidateQueries will trigger it once the server responds.
      const cached = queryClient.getQueryData<TabDetailFull>(['tab', id]);
      if (cached?.expenses.some((e) => e.id.startsWith('temp-expense-'))) return;
      refetch();
    }, [refetch, id])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  const handleToggleExpense = useCallback(
    (expenseId: string) => toggleExpense.mutate(expenseId),
    [toggleExpense]
  );

  const handleUnlock = useCallback(
    () => unlockLinks.mutate(),
    [unlockLinks]
  );

  const handleSettle = useCallback((
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
    const myName = data?.tab.members.find((m) => m.user_id === userId)?.display_name ?? '';
    createSettlement.mutate({
      counterpartId,
      counterpartName,
      amount,
      iOwe,
      initiatorId: userId ?? '',
      initiatorName: myName,
      tempId: `temp-${Date.now()}`,
    });
  }, [data?.tab.name, data?.tab.members, userId, createSettlement]);

  const handleRestoreAction = useCallback(
    (settlementId: string) => restoreSettlement.mutate(settlementId),
    [restoreSettlement]
  );

  const handleRestoreCommit = useCallback(
    (settlementId: string) => restoreSettlement.commit(settlementId),
    [restoreSettlement]
  );

  const handleReSettle = useCallback((
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
    reSettleBalance.mutate(settlementId);
  }, [data?.tab.name, reSettleBalance]);

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

  const { tab, expenses, balances, settlements: rawSettlements } = data;
  const myBalances = toMyBalances(balances, userId ?? '');
  const memberMap = Object.fromEntries(tab.members.map((m) => [m.user_id, m]));

  // Normalize i_owe to always reflect the current user's perspective.
  // When someone else initiated the settlement, their i_owe is from their perspective — flip it.
  const settlements = rawSettlements.map((s) =>
    s.initiator_id === (userId ?? '') ? s : { ...s, i_owe: !s.i_owe }
  );

  // ── Balance display computation ───────────────────────────
  //
  // outstanding = viewAmount - sum(ALL settlements for this counterpart)
  // This means: settled amounts subtract from the view total regardless of
  // whether they've been restored. Restored settlements each show as their own
  // active row so the per-counterpart totals still reconcile.

  function totalSettledFor(counterpartId: string): number {
    return settlements
      .filter((s) => s.counterpart_id === counterpartId || s.initiator_id === counterpartId)
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
    // Set only for previously-settled rows.
    settlement_id?: string;
    initiator_id?: string;
    initiator_name?: string;
  };

  function renderActiveRow(cfg: ActiveRowConfig) {
    const member = memberMap[cfg.counterpart_id];
    const venmoHandle = member?.venmo_handle ?? null;
    const cashappHandle = member?.cashapp_handle ?? null;
    const isOwner = !cfg.previously_settled || cfg.initiator_id === userId;

    return (
      <View key={cfg.key} style={styles.balanceRow}>
        <View style={styles.balanceLeft}>
          <Text style={styles.balanceName}>{cfg.counterpart_name}</Text>
          {cfg.previously_settled && (
            <Text style={styles.previouslySettledTag}>
              Previously settled by {cfg.initiator_name}
            </Text>
          )}
        </View>
        <View style={styles.balanceRight}>
          <Text style={[styles.balanceAmount, cfg.i_owe ? styles.owe : styles.owed]}>
            {cfg.i_owe ? '−' : '+'}${cfg.amount.toFixed(2)}
          </Text>
          {isOwner && (
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
          )}
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
              initiator_id: s.initiator_id,
              initiator_name: s.initiator_name,
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
              initiator_id: s.initiator_id,
              initiator_name: s.initiator_name,
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          android_ripple={null}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={styles.navBackLabel}>My Tabs</Text>
        </Pressable>
        <Pressable
          onPress={handleLeaveTab}
          android_ripple={null}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="log-out-outline" size={22} color="#ff453a" />
        </Pressable>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerNameRow}>
          <Text style={styles.tabName}>{tab.name}</Text>
          <Pressable
            onPress={handleShowInvite}
            android_ripple={null}
            style={({ pressed }) => [styles.addPersonBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="person-add-outline" size={22} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.meta}>
          {tab.members.length} {tab.members.length === 1 ? 'member' : 'members'} · {tab.status}
        </Text>
      </View>

      {/* Toggle */}
      <View style={styles.toggle}>
        <Pressable
          android_ripple={null}
          style={({ pressed }) => [styles.toggleBtn, panel === 'expenses' && styles.toggleActive, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => setPanel('expenses')}
        >
          <Text style={[styles.toggleLabel, panel === 'expenses' && styles.toggleLabelActive]}>
            Expenses
          </Text>
        </Pressable>
        <Pressable
          android_ripple={null}
          style={({ pressed }) => [styles.toggleBtn, panel === 'balances' && styles.toggleActive, { opacity: pressed ? 0.6 : 1 }]}
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
            android_ripple={null}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
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
              <SettledRow item={item} onAction={handleRestoreAction} onCommit={handleRestoreCommit} />
            )}
          />
          {!linksUnlocked && hasAnything && (
            <Pressable android_ripple={null} style={({ pressed }) => [styles.unlockBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={handleUnlock}>
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

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', padding: 6 },
  navBackLabel: { color: '#fff', fontSize: 17 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: DARK_BORDER },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  addPersonBtn: { padding: 2 },
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
