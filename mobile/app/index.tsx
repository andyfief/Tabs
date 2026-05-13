import { useCallback, useRef, useState } from 'react';
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
import { SwipeToActionRow } from '../components/SwipeToActionRow';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { queryClient } from '../utils/queryClient';
import { Tab, fetchAllTabs, fetchTabDetail } from '../utils/tabQueries';
import { useCreateTab, useClearTab, useLeaveTab } from '../hooks/useTabMutations';

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
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPress: () => void;
  onClear: (id: string) => void;
  onLeave: (id: string) => void;
};

function TabRow({ item, isOpen, onOpen, onClose, onPress, onClear, onLeave }: TabRowProps) {
  return (
    <SwipeToActionRow
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      renderActions={() => (
        <>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnClear]}
            onPress={() => onClear(item.id)}
          >
            <Text style={styles.actionBtnText}>Clear</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnLeave]}
            onPress={() => onLeave(item.id)}
          >
            <Text style={styles.actionBtnText}>Leave Tab</Text>
          </Pressable>
        </>
      )}
    >
      <Pressable style={styles.row} onPress={isOpen ? onClose : onPress}>
        <Text style={styles.tabName}>{item.name}</Text>
        <AvatarCircles count={item.member_count} />
      </Pressable>
    </SwipeToActionRow>
  );
}

type NewTabDraftRowProps = {
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

function NewTabDraftRow({ onSubmit, onCancel }: NewTabDraftRowProps) {
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
      <AvatarCircles count={1} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const createTab = useCreateTab();
  const clearTab = useClearTab();
  const leaveTab = useLeaveTab();

  const { data: allTabs = [], isLoading, error } = useQuery({
    queryKey: ['tabs'],
    queryFn: fetchAllTabs,
  });

  // On return to this screen, revalidate only if the cached list is actually stale.
  // This is a no-op when we just seeded the cache via setQueryData (data is fresh).
  useFocusEffect(
    useCallback(() => {
      queryClient.refetchQueries({ queryKey: ['tabs'], type: 'active', stale: true });
    }, [])
  );

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
          if (tab && !tab.id.startsWith('temp-')) {
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

  function handleClear(id: string) {
    setOpenTabId(null);
    clearTab.mutate(id);
    clearTab.commit(id);
  }

  function handleLeave(id: string) {
    setOpenTabId(null);
    leaveTab.mutate(id);
    leaveTab.commit(id);
  }

  function handleCreateTab(name: string) {
    const tempId = `temp-${Date.now()}`;
    createTab.mutate({ name, tempId }, { onError: () => router.back() });
    setCreatingNew(false);
    router.push(`/tab/${tempId}`);
  }

  if (isLoading) return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;

  if (error) {
    return <View style={styles.center}><Text style={styles.error}>{(error as Error).message}</Text></View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Modal visible={menuOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuDropdown, { top: insets.top + 46 }]}>
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

      {/* Nav bar */}
      <View style={styles.navBar}>
        {process.env.EXPO_PUBLIC_SKIP_AUTH !== 'true' ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            android_ripple={null}
            style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="menu" size={24} color="#fff" />
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
        <Text style={styles.navTitle}>My Tabs</Text>
        <Pressable
          onPress={() => router.push('/cleared-tabs')}
          android_ripple={null}
          style={({ pressed }) => [styles.clearedBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.clearedBtnLabel}>Cleared</Text>
        </Pressable>
      </View>

      <FlatList
        data={tabs}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <TabRow
            item={item}
            isOpen={openTabId === item.id}
            onOpen={() => setOpenTabId(item.id)}
            onClose={() => setOpenTabId(null)}
            onPress={() => { setOpenTabId(null); router.push(`/tab/${item.id}`); }}
            onClear={handleClear}
            onLeave={handleLeave}
          />
        )}
        ListFooterComponent={
          creatingNew ? (
            <NewTabDraftRow
              onSubmit={handleCreateTab}
              onCancel={() => setCreatingNew(false)}
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
        <Pressable
          android_ripple={null}
          style={({ pressed }) => [styles.fab, styles.fabSecondary, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push('/join')}
        >
          <Text style={styles.fabSecondaryLabel}>Join Tab</Text>
        </Pressable>
        <Pressable
          android_ripple={null}
          style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => setCreatingNew(true)}
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

  // Nav bar
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

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    backgroundColor: DARK_CARD,
  },
  tabName: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Action buttons revealed on swipe
  actionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnClear: { backgroundColor: '#3a3a3c' },
  actionBtnLeave: { backgroundColor: '#ff453a' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

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
  },

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
