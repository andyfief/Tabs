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
import { useRestoreTab } from '../hooks/useTabMutations';

const DARK_BG = '#1c1c1e';
const DARK_CARD = '#2c2c2e';
const DARK_BORDER = '#3a3a3c';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type TabRowProps = {
  item: Tab;
  onPress: () => void;
  onAction: (id: string) => void;
  onCommit: (id: string) => void;
};

function ClearedTabRow({ item, onPress, onAction, onCommit }: TabRowProps) {
  return (
    <SwipeToActionRow
      label="Restore"
      activeColor="#30d158"
      dimColor="#0d2a15"
      disappears={true}
      onAction={() => onAction(item.id)}
      onCommit={() => onCommit(item.id)}
    >
      <Pressable style={styles.row} onPress={onPress}>
        <View style={styles.rowLeft}>
          <Text style={styles.tabName}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>
        <Text style={styles.date}>Created {formatDate(item.created_at)}</Text>
      </Pressable>
    </SwipeToActionRow>
  );
}

export default function ClearedTabsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const restoreTab = useRestoreTab();

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
            onPress={() => router.push(`/tab/${item.id}`)}
            onAction={restoreTab.mutate}
            onCommit={restoreTab.commit}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_BORDER,
    backgroundColor: DARK_CARD,
  },
  rowLeft: { flex: 1, marginRight: 12 },
  tabName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  meta: { fontSize: 13, color: '#8e8e93', marginTop: 2 },
  date: { fontSize: 12, color: '#8e8e93' },

  empty: { color: '#8e8e93', fontSize: 15 },
  error: { color: '#ff453a', fontSize: 14, textAlign: 'center', padding: 16 },
});
