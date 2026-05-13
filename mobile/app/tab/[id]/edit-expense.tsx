import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { fetchTabDetail } from '../../../utils/tabQueries';
import type { Member } from '../../../utils/tabQueries';
import { useUpdateExpense, useToggleExpense } from '../../../hooks/useTabMutations';

const DARK_BG = '#1c1c1e';
const DARK_CARD = '#2c2c2e';
const DARK_BORDER = '#3a3a3c';

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

export default function EditExpenseScreen() {
  const { id: tabId, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const updateExpense = useUpdateExpense(tabId!);
  const toggleExpense = useToggleExpense(tabId!);

  const { data, isLoading } = useQuery({
    queryKey: ['tab', tabId],
    queryFn: () => fetchTabDetail(tabId!),
    enabled: !!tabId,
  });

  const members: Member[] = data?.tab.members ?? [];
  const expense = data?.expenses.find((e) => e.id === expenseId);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState('');
  const [splitIds, setSplitIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the original values so we can detect changes.
  const originalTitle = useRef('');
  const originalAmount = useRef('');
  const originalPayerId = useRef('');
  const originalSplitIds = useRef<Set<string>>(new Set());
  const formInitialized = useRef(false);

  // Seed form fields once when expense data arrives. Ref guard prevents re-seed on refetch.
  useEffect(() => {
    if (formInitialized.current || !expense) return;
    const amountStr = expense.amount.toFixed(2);
    setTitle(expense.title);
    setAmount(amountStr);
    setPayerId(expense.payer_id);
    setSplitIds(new Set(expense.split_member_ids));
    originalTitle.current = expense.title;
    originalAmount.current = amountStr;
    originalPayerId.current = expense.payer_id;
    originalSplitIds.current = new Set(expense.split_member_ids);
    formInitialized.current = true;
  }, [expense]);

  function toggleSplit(userId: string) {
    setSplitIds((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  const hasChanges =
    formInitialized.current && (
      title.trim() !== originalTitle.current ||
      amount !== originalAmount.current ||
      payerId !== originalPayerId.current ||
      !setsEqual(splitIds, originalSplitIds.current)
    );

  function handleSubmit() {
    const parsedAmount = parseFloat(amount);
    if (!title.trim()) { setError('Title is required.'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount.'); return; }
    if (splitIds.size === 0) { setError('Select at least one member for the split.'); return; }
    setError(null);
    const payerName = members.find((m) => m.user_id === payerId)?.display_name ?? '';
    updateExpense.mutate(
      {
        expenseId: expenseId!,
        title: title.trim(),
        amount: parsedAmount,
        payerId,
        payerName,
        splitMemberIds: Array.from(splitIds),
      },
      { onError: (e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not save changes.') }
    );
    router.back();
  }

  function handleToggleRemove() {
    setMenuOpen(false);
    toggleExpense.mutate(expenseId!, {
      onError: (e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not update expense.'),
    });
    router.back();
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const isRemoved = expense?.removed_at != null;

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG, paddingTop: insets.top }}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          android_ripple={null}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.navTitle}>Edit Expense</Text>
        <Pressable
          onPress={() => setMenuOpen(true)}
          android_ripple={null}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="menu" size={24} color="#fff" />
        </Pressable>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Title */}
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Dinner, Uber, Groceries"
          placeholderTextColor="#555"
          value={title}
          onChangeText={setTitle}
        />

        {/* Amount */}
        <Text style={styles.label}>Amount *</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor="#555"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        {/* Payer — single select */}
        <Text style={styles.label}>Paid by *</Text>
        <View style={styles.listBox}>
          <ScrollView nestedScrollEnabled style={styles.scrollList}>
            {members.map((m) => (
              <Pressable
                key={m.user_id}
                style={styles.memberRow}
                onPress={() => setPayerId(m.user_id)}
              >
                <View style={[styles.check, payerId === m.user_id && styles.checkSelected]}>
                  {payerId === m.user_id && <View style={styles.checkInner} />}
                </View>
                <Text style={styles.memberName}>{m.display_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Split — multi select */}
        <Text style={styles.label}>Split between *</Text>
        <View style={styles.listBox}>
          <ScrollView nestedScrollEnabled style={styles.scrollList}>
            {members.map((m) => (
              <Pressable
                key={m.user_id}
                style={styles.memberRow}
                onPress={() => toggleSplit(m.user_id)}
              >
                <View style={[styles.check, styles.checkSquare, splitIds.has(m.user_id) && styles.checkSelected]}>
                  {splitIds.has(m.user_id) && <View style={styles.checkInner} />}
                </View>
                <Text style={styles.memberName}>{m.display_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.submitBtn, !hasChanges && styles.submitBtnDisabled]}
          onPress={hasChanges ? handleSubmit : undefined}
        >
          <Text style={styles.submitLabel}>Save Changes</Text>
        </Pressable>
      </ScrollView>

      {/* Three-line menu modal */}
      <Modal visible={menuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuDropdown, { top: insets.top + 46 }]}>
                <Pressable
                  style={styles.menuItem}
                  onPress={handleToggleRemove}
                >
                  <Text style={[styles.menuItemText, isRemoved ? styles.menuItemRestore : styles.menuItemRemove]}>
                    {isRemoved ? 'Restore Expense' : 'Remove Expense'}
                  </Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
  },
  navBtn: { padding: 6 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#fff' },

  label: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 20, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: DARK_BORDER,
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    color: '#fff',
  },

  listBox: {
    borderWidth: 1,
    borderColor: DARK_BORDER,
    borderRadius: 6,
    maxHeight: 160,
    overflow: 'hidden',
  },
  scrollList: { flexGrow: 0 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    backgroundColor: DARK_CARD,
  },
  memberName: { fontSize: 15, marginLeft: 10, color: '#fff' },

  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: DARK_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkSquare: { borderRadius: 4 },
  checkSelected: { borderColor: '#0a84ff', backgroundColor: '#0a84ff' },
  checkInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },

  error: { color: '#ff453a', fontSize: 13, marginTop: 14 },
  submitBtn: {
    marginTop: 28,
    padding: 14,
    backgroundColor: DARK_BORDER,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },

  menuOverlay: { flex: 1 },
  menuDropdown: {
    position: 'absolute',
    right: 12,
    backgroundColor: DARK_CARD,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    minWidth: 180,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: { paddingVertical: 14, paddingHorizontal: 16 },
  menuItemText: { fontSize: 15 },
  menuItemRemove: { color: '#ff453a' },
  menuItemRestore: { color: '#30d158' },
});
