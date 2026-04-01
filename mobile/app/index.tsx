import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import { supabase } from '../utils/supabase';
import { queryClient } from '../utils/queryClient';
import { Tab, fetchAllTabs, fetchTabDetail } from '../utils/tabQueries';

const DARK_BG = '#1c1c1e';
const DARK_CARD = '#2c2c2e';
const DARK_BORDER = '#3a3a3c';

function AvatarCircles({ count }: { count: number }) {
  const visible = Math.min(count, 3);
  const overflow = count - visible;
  return (
    <View style={styles.avatarRow}>
      {Array.from({ length: visible }).map((_, i) => (
        <View key={i} style={styles.avatarCircle} />
      ))}
      {overflow > 0 && (
        <View style={[styles.avatarCircle, styles.avatarOverflow]}>
          <Text style={styles.avatarOverflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

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
        <AvatarCircles count={item.member_count} />
      </Pressable>
    </Swipeable>
  );
}

type NewTabDraftRowProps = {
  onSubmit: (name: string) => void;
  onCancel: () => void;
  submitting: boolean;
};

function NewTabDraftRow({ onSubmit, onCancel, submitting }: NewTabDraftRowProps) {
  const [name, setName] = useState('');
  const didSubmit = useRef(false);

  function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed) {
      didSubmit.current = true;
      onSubmit(trimmed);
    }
  }

  // Cancel whenever the keyboard is dismissed, unless we already submitted
  function handleBlur() {
    if (!didSubmit.current) {
      onCancel();
    }
  }

  return (
    <View style={[styles.row, styles.draftRow]}>
      {submitting ? (
        <ActivityIndicator color="#fff" size="small" style={styles.draftSpinner} />
      ) : (
        <TextInput
          style={styles.draftInput}
          placeholder="Tab name"
          placeholderTextColor="#555"
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleSubmit}
          onBlur={handleBlur}
          autoFocus
          returnKeyType="done"
        />
      )}
      <AvatarCircles count={1} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [draftSubmitting, setDraftSubmitting] = useState(false);

  const { data: allTabs = [], isLoading, error } = useQuery({
    queryKey: ['tabs'],
    queryFn: fetchAllTabs,
  });

  const tabs = allTabs.filter((t) => !t.is_cleared);

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
    queryClient.setQueryData<Tab[]>(['tabs'], (prev = []) =>
      prev.map((t) => t.id === tabId ? { ...t, is_cleared: true } : t)
    );
    try {
      await apiFetch(`/tabs/${tabId}/clear`, { method: 'PATCH' });
    } catch {
      queryClient.setQueryData<Tab[]>(['tabs'], (prev = []) =>
        prev.map((t) => t.id === tabId ? { ...t, is_cleared: false } : t)
      );
    }
  }, []);

  async function handleCreateTab(name: string) {
    setDraftSubmitting(true);
    try {
      const tab = await apiFetch<{ id: string }>('/tabs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setCreatingNew(false);
      setDraftSubmitting(false);
      router.push(`/tab/${tab.id}`);
    } catch {
      setDraftSubmitting(false);
    }
  }

  if (isLoading) return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;

  if (error) {
    return <View style={styles.center}><Text style={styles.error}>{(error as Error).message}</Text></View>;
  }

  return (
    <View style={styles.container}>
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
        ListFooterComponent={
          creatingNew ? (
            <NewTabDraftRow
              onSubmit={handleCreateTab}
              onCancel={() => setCreatingNew(false)}
              submitting={draftSubmitting}
            />
          ) : null
        }
        ListEmptyComponent={
          !creatingNew ? (
            <View style={styles.center}>
              <Text style={styles.empty}>No open tabs yet.</Text>
            </View>
          ) : null
        }
        contentContainerStyle={tabs.length === 0 && !creatingNew ? styles.emptyContainer : undefined}
      />
      <View style={styles.bottomRow}>
        <Pressable style={[styles.fab, styles.fabSecondary]} onPress={() => router.push('/join')}>
          <Text style={styles.fabSecondaryLabel}>Join Tab</Text>
        </Pressable>
        <Pressable
          style={styles.fab}
          onPress={() => { setCreatingNew(true); setDraftSubmitting(false); }}
          disabled={creatingNew}
        >
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
  tabName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 8 },

  // Avatar circles
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatarCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#48484a',
  },
  avatarOverflow: { justifyContent: 'center', alignItems: 'center' },
  avatarOverflowText: { fontSize: 8, color: '#8e8e93', fontWeight: '600' },

  // Draft row
  draftRow: { borderLeftWidth: 2, borderLeftColor: '#555' },
  draftInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    padding: 0,
    marginBottom: 8,
  },
  draftSpinner: { marginBottom: 8, alignSelf: 'flex-start' },

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
