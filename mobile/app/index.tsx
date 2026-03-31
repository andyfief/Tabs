import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { apiFetch } from '../utils/api';
import { supabase } from '../utils/supabase';

type Tab = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
};

type TabRowProps = {
  item: Tab;
  onPress: () => void;
  onClear: (id: string) => void;
};

function TabRow({ item, onPress, onClear }: TabRowProps) {
  const renderRightAction = () => (
    <Pressable style={styles.swipeClear} onPress={() => onClear(item.id)}>
      <Text style={styles.swipeLabel}>Clear</Text>
    </Pressable>
  );
  return (
    <Swipeable renderRightActions={renderRightAction} overshootRight={false}>
      <Pressable style={styles.row} onPress={onPress}>
        <Text style={styles.tabName}>{item.name}</Text>
        <Text style={styles.memberCount}>
          {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
        </Text>
      </Pressable>
    </Swipeable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const fetchTabs = useCallback(async () => {
    try {
      const data = await apiFetch<Tab[]>('/tabs');
      setTabs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tabs.');
    }
  }, []);

  useEffect(() => {
    fetchTabs().finally(() => {
      setLoading(false);
      initialized.current = true;
    });
  }, [fetchTabs]);

  useFocusEffect(
    useCallback(() => {
      if (!initialized.current) return;
      fetchTabs();
    }, [fetchTabs])
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable style={styles.headerBtn} onPress={() => router.push('/join')}>
            <Text style={styles.headerBtnLabel}>Join</Text>
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={() => router.push('/cleared-tabs')}>
            <Text style={styles.headerBtnLabel}>Cleared</Text>
          </Pressable>
          {process.env.EXPO_PUBLIC_SKIP_AUTH !== 'true' && (
            <Pressable style={styles.headerBtn} onPress={() => supabase.auth.signOut()}>
              <Text style={[styles.headerBtnLabel, styles.signOutLabel]}>Sign Out</Text>
            </Pressable>
          )}
        </View>
      ),
    });
  }, [navigation, router]);

  const handleClear = useCallback(async (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    try {
      await apiFetch(`/tabs/${tabId}/clear`, { method: 'PATCH' });
    } catch {
      fetchTabs();
    }
  }, [fetchTabs]);

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  if (error) {
    return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tabs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TabRow
            item={item}
            onPress={() => router.push(`/tab/${item.id}`)}
            onClear={handleClear}
          />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>No open tabs yet.</Text>
          </View>
        }
        contentContainerStyle={tabs.length === 0 ? styles.emptyContainer : undefined}
      />
      <View style={styles.bottomRow}>
        <Pressable style={[styles.fab, styles.fabSecondary]} onPress={() => router.push('/join')}>
          <Text style={styles.fabSecondaryLabel}>Join Tab</Text>
        </Pressable>
        <Pressable style={styles.fab} onPress={() => router.push('/create-tab')}>
          <Text style={styles.fabLabel}>+ New Tab</Text>
        </Pressable>
      </View>
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
    backgroundColor: '#fff',
  },
  tabName: { fontSize: 16, fontWeight: '600' },
  memberCount: { fontSize: 13, color: '#666', marginTop: 2 },

  swipeClear: {
    backgroundColor: '#888',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  swipeLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  headerRight: { flexDirection: 'row', gap: 8, marginRight: 4 },
  headerBtn: { padding: 6 },
  headerBtnLabel: { fontSize: 14, color: '#888' },
  signOutLabel: { color: '#c0392b' },

  bottomRow: { flexDirection: 'row', gap: 10, margin: 16 },
  fab: {
    flex: 1, padding: 14, backgroundColor: '#000',
    borderRadius: 8, alignItems: 'center',
  },
  fabLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
  fabSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#000' },
  fabSecondaryLabel: { color: '#000', fontWeight: '600', fontSize: 15 },

  empty: { color: '#999', fontSize: 15 },
  error: { color: 'red', fontSize: 14, textAlign: 'center', padding: 16 },
});
