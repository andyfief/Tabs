import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '../../../utils/api';
import { HARDCODED_USER_ID } from '../../../utils/constants';

const DARK_BG = '#1c1c1e';
const DARK_CARD = '#2c2c2e';
const DARK_BORDER = '#3a3a3c';

type Member = { user_id: string; display_name: string };

export default function AddExpenseScreen() {
  const { id: tabId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(HARDCODED_USER_ID);
  // All members selected for the split by default
  const [splitIds, setSplitIds] = useState<Set<string>>(new Set());

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ id: string; members: Member[] }>(`/tabs/${tabId}`)
      .then((tab) => {
        setMembers(tab.members);
        setSplitIds(new Set(tab.members.map((m) => m.user_id)));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingMembers(false));
  }, [tabId]);

  function toggleSplit(userId: string) {
    setSplitIds((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  async function handleSubmit() {
    const parsedAmount = parseFloat(amount);
    if (!title.trim()) { setError('Title is required.'); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount.'); return; }
    if (splitIds.size === 0) { setError('Select at least one member for the split.'); return; }

    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/tabs/${tabId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          amount: parsedAmount,
          payer_id: payerId,
          split_member_ids: Array.from(splitIds),
        }),
      });
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMembers) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title */}
      <Text style={styles.label}>Title *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Dinner, Uber, Groceries"
        placeholderTextColor="#555"
        value={title}
        onChangeText={setTitle}
        autoFocus
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

      <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitLabel}>Add Expense</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  label: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 20, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: DARK_BORDER,
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    color: '#fff',
  },

  // Capped-height scrollable member list
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

  // Shared check indicator (radio = circle, checkbox = square)
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
  submitLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
