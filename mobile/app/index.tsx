import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { apiFetch } from '../utils/api';
import { supabase } from '../utils/supabase';
import { queryClient, TAB_DETAIL_STALE_TIME } from '../utils/queryClient';
import { fetchTabDetail } from '../utils/tabQueries';

const DARK_BG = '#1c1c1e';
const DARK_CARD = '#2c2c2e';
const DARK_BORDER = '#3a3a3c';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const initialized = useRef(false);

  // Kept in a ref so the FlatList callback never changes identity after mount.
  const tabsRef = useRef<Tab[]>([]);
  tabsRef.current = tabs;

  // Prefetch visible tabs plus up to 3 items below the viewport.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const list = tabsRef.current;
      viewableItems.forEach(({ index }) => {
        if (index === null) return;
        for (let i = index; i <= Math.min(index + 3, list.length - 1); i++) {
          const tab = list[i];
          if (tab) {
            queryClient.prefetchQuery({
              queryKey: ['tab', tab.id],
              queryFn: () => fetchTabDetail(tab.id),
              staleTime: TAB_DETAIL_STALE_TIME,
            });
          }
        }
      });
    }
  ).current;

  const viewabilityConfig = useRef({
    minimumViewTime: 200,
    itemVisiblePercentThreshold: 50,
  }).current;

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
      headerLeft: () =>
        process.env.EXPO_PUBLIC_SKIP_AUTH !== 'true' ? (
          <Pressable style={styles.headerMenuBtn} onPress={() => setMenuOpen(true)}>
            <Text style={styles.headerMenuCaret}>∨</Text>
          </Pressable>
        ) : null,
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitleText}>My Tabs</Text>
          <Pressable style={styles.clearedBtn} onPress={() => router.push('/cleared-tabs')}>
            <Text style={styles.clearedBtnLabel}>Cleared</Text>
          </Pressable>
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

  if (loading) return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;

  if (error) {
    return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  }

  return (
    <View style={styles.container}>
      {/* Caret dropdown menu */}
      <Modal visible={menuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuDropdown}>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    supabase.auth.signOut();
                  }}
                >
                  <Text style={styles.menuItemSignOut}>Sign Out</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <FlatList
        data={tabs}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
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
  container: { flex: 1, backgroundColor: DARK_BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1 },

  row: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    backgroundColor: DARK_CARD,
  },
  tabName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  memberCount: { fontSize: 13, color: '#8e8e93', marginTop: 2 },

  swipeClear: {
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  swipeLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Header
  headerMenuBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  headerMenuCaret: { fontSize: 18, color: '#fff', fontWeight: '600' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitleText: { fontSize: 17, fontWeight: '600', color: '#fff' },
  clearedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: DARK_BORDER,
  },
  clearedBtnLabel: { fontSize: 13, color: '#8e8e93' },

  // Dropdown menu
  menuOverlay: { flex: 1 },
  menuDropdown: {
    position: 'absolute',
    top: 90,
    left: 12,
    backgroundColor: DARK_CARD,
    borderRadius: 10,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: { paddingVertical: 14, paddingHorizontal: 16 },
  menuItemSignOut: { fontSize: 15, color: '#ff453a' },

  bottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 32,
    marginTop: 8,
  },
  fab: {
    flex: 1,
    padding: 14,
    backgroundColor: DARK_BORDER,
    borderRadius: 8,
    alignItems: 'center',
  },
  fabLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
  fabSecondary: { backgroundColor: DARK_CARD, borderWidth: 1, borderColor: '#555' },
  fabSecondaryLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },

  empty: { color: '#8e8e93', fontSize: 15 },
  error: { color: '#ff453a', fontSize: 14, textAlign: 'center', padding: 16 },
});
