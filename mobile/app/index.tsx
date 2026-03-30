import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch } from '../utils/api';

type Tab = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Tab[]>('/tabs')
      .then(setTabs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
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
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/tab/${item.id}`)}
          >
            <Text style={styles.tabName}>{item.name}</Text>
            <Text style={styles.memberCount}>
              {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>No open tabs yet.</Text>
          </View>
        }
        contentContainerStyle={tabs.length === 0 ? styles.emptyContainer : undefined}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/create-tab')}>
        <Text style={styles.fabLabel}>+ New Tab</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1 },
  row: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  tabName: { fontSize: 16, fontWeight: '600' },
  memberCount: { fontSize: 13, color: '#666', marginTop: 2 },
  empty: { color: '#999', fontSize: 15 },
  error: { color: 'red', fontSize: 14, textAlign: 'center', padding: 16 },
  fab: {
    margin: 16,
    padding: 14,
    backgroundColor: '#000',
    borderRadius: 8,
    alignItems: 'center',
  },
  fabLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
