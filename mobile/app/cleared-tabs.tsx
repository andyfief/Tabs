import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { apiFetch } from '../utils/api';

type ClearedTab = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type TabRowProps = {
  item: ClearedTab;
  onPress: () => void;
  onRestore: (id: string) => void;
};

function ClearedTabRow({ item, onPress, onRestore }: TabRowProps) {
  const renderRightAction = () => (
    <Pressable style={styles.swipeRestore} onPress={() => onRestore(item.id)}>
      <Text style={styles.swipeLabel}>Restore</Text>
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightAction} overshootRight={false}>
      <Pressable style={styles.row} onPress={onPress}>
        <View style={styles.rowLeft}>
          <Text style={styles.tabName}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
            {item.description ? `  ·  ${item.description}` : ''}
          </Text>
        </View>
        <Text style={styles.date}>Created {formatDate(item.created_at)}</Text>
      </Pressable>
    </Swipeable>
  );
}

export default function ClearedTabsScreen() {
  const router = useRouter();
  const [tabs, setTabs] = useState<ClearedTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCleared = useCallback(async () => {
    try {
      const data = await apiFetch<ClearedTab[]>('/tabs/cleared');
      setTabs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cleared tabs.');
    }
  }, []);

  useEffect(() => {
    fetchCleared().finally(() => setLoading(false));
  }, [fetchCleared]);

  const handleRestore = useCallback(async (tabId: string) => {
    // Optimistic: remove from cleared list immediately
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    try {
      await apiFetch(`/tabs/${tabId}/clear`, { method: 'PATCH' });
    } catch {
      fetchCleared();
    }
  }, [fetchCleared]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tabs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ClearedTabRow
            item={item}
            onPress={() => router.push(`/tab/${item.id}`)}
            onRestore={handleRestore}
          />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>No cleared tabs.</Text>
          </View>
        }
        contentContainerStyle={tabs.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1 },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  tabName: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#888', marginTop: 2 },
  date: { fontSize: 12, color: '#aaa' },

  swipeRestore: {
    backgroundColor: '#27ae60',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
  },
  swipeLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  empty: { color: '#999', fontSize: 15 },
  error: { color: 'red', fontSize: 14, textAlign: 'center', padding: 16 },
});
