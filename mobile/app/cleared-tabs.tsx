import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SwipeToActionRow } from '../components/SwipeToActionRow';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Tab, fetchAllTabs } from '../utils/tabQueries';
import { useRestoreTab, useLeaveTab } from '../hooks/useTabMutations';

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
  onRestore: (id: string) => void;
  onLeave: (id: string) => void;
};

function ClearedTabRow({ item, isOpen, onOpen, onClose, onPress, onRestore, onLeave }: TabRowProps) {
  return (
    <SwipeToActionRow
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      renderActions={() => (
        <>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnRestore]}
            onPress={() => onRestore(item.id)}
          >
            <Text style={styles.actionBtnText}>Restore</Text>
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

export default function ClearedTabsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const restoreTab = useRestoreTab();
  const leaveTab = useLeaveTab();

  function handleRestore(id: string) {
    setOpenTabId(null);
    restoreTab.mutate(id);
    restoreTab.commit(id);
  }

  function handleLeave(id: string) {
    setOpenTabId(null);
    leaveTab.mutate(id);
    leaveTab.commit(id);
  }

  const { data: allTabs = [], isLoading, error } = useQuery({
    queryKey: ['tabs'],
    queryFn: fetchAllTabs,
  });

  const tabs = allTabs.filter((t) => t.is_cleared);

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          android_ripple={null}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.navTitle}>Cleared Tabs</Text>
        <View style={styles.navBtn} />
      </View>
      <FlatList
        data={tabs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ClearedTabRow
            item={item}
            isOpen={openTabId === item.id}
            onOpen={() => setOpenTabId(item.id)}
            onClose={() => setOpenTabId(null)}
            onPress={() => { setOpenTabId(null); router.push(`/tab/${item.id}`); }}
            onRestore={handleRestore}
            onLeave={handleLeave}
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
  container: { flex: 1, backgroundColor: DARK_BG },
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
  emptyContainer: { flex: 1 },

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
  actionBtnRestore: { backgroundColor: '#1a3a20' },
  actionBtnLeave: { backgroundColor: '#ff453a' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatarCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#48484a',
  },
  avatarOverflow: { justifyContent: 'center', alignItems: 'center' },
  avatarOverflowText: { fontSize: 8, color: '#8e8e93', fontWeight: '600' },

  empty: { color: '#8e8e93', fontSize: 15 },
  error: { color: '#ff453a', fontSize: 14, textAlign: 'center', padding: 16 },
});
