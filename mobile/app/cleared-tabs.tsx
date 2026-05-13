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
import * as Haptics from 'expo-haptics';
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
  onPress: () => void;
  onAction: (id: string) => void;
  onCommit: (id: string) => void;
  isLeaveMode: boolean;
  onLongPress: (id: string) => void;
  onLeaveConfirm: (id: string) => void;
  onLeaveDismiss: () => void;
};

function ClearedTabRow({ item, onPress, onAction, onCommit, isLeaveMode, onLongPress, onLeaveConfirm, onLeaveDismiss }: TabRowProps) {
  return (
    <SwipeToActionRow
      label="Restore"
      activeColor="#30d158"
      dimColor="#0d2a15"
      disappears={true}
      onAction={() => onAction(item.id)}
      onCommit={() => onCommit(item.id)}
    >
      <Pressable
        style={[styles.row, isLeaveMode && styles.rowLeaveMode]}
        onPress={isLeaveMode ? onLeaveDismiss : onPress}
        onLongPress={() => isLeaveMode ? onLeaveDismiss() : onLongPress(item.id)}
        delayLongPress={400}
      >
        <Text style={styles.tabName}>{item.name}</Text>
        {isLeaveMode ? (
          <Pressable
            style={styles.leaveBtn}
            onPress={() => onLeaveConfirm(item.id)}
            hitSlop={8}
          >
            <Text style={styles.leaveBtnText}>Leave Tab</Text>
          </Pressable>
        ) : (
          <AvatarCircles count={item.member_count} />
        )}
      </Pressable>
    </SwipeToActionRow>
  );
}

export default function ClearedTabsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [leavingTabId, setLeavingTabId] = useState<string | null>(null);
  const restoreTab = useRestoreTab();
  const leaveTab = useLeaveTab();

  function handleLongPress(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLeavingTabId(id);
  }

  function handleLeaveConfirm(id: string) {
    setLeavingTabId(null);
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
            onPress={() => { setLeavingTabId(null); router.push(`/tab/${item.id}`); }}
            onAction={restoreTab.mutate}
            onCommit={restoreTab.commit}
            isLeaveMode={leavingTabId === item.id}
            onLongPress={handleLongPress}
            onLeaveConfirm={handleLeaveConfirm}
            onLeaveDismiss={() => setLeavingTabId(null)}
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
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    backgroundColor: DARK_CARD,
  },
  rowLeaveMode: { borderLeftWidth: 3, borderLeftColor: '#ff453a' },
  leaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ff453a',
    borderRadius: 6,
  },
  leaveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  tabName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 8 },

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
