import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiFetch } from '../../utils/api';

type Member = {
  user_id: string;
  display_name: string;
};

type TabDetail = {
  id: string;
  name: string;
  description: string | null;
  status: 'open' | 'closed';
  members: Member[];
};

export default function TabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<TabDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TabDetail>(`/tabs/${id}`)
      .then(setTab)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !tab) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Tab not found.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{tab.name}</Text>
        {tab.description ? (
          <Text style={styles.description}>{tab.description}</Text>
        ) : null}
        <Text style={styles.status}>Status: {tab.status}</Text>
      </View>

      <Text style={styles.sectionTitle}>
        Members ({tab.members.length})
      </Text>
      <FlatList
        data={tab.members}
        keyExtractor={(item) => item.user_id}
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <Text style={styles.memberName}>{item.display_name}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  name: { fontSize: 22, fontWeight: '700' },
  description: { fontSize: 14, color: '#555', marginTop: 4 },
  status: { fontSize: 12, color: '#999', marginTop: 6 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    padding: 16,
    paddingBottom: 8,
  },
  memberRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  memberName: { fontSize: 15 },
  error: { color: 'red', fontSize: 14, textAlign: 'center', padding: 16 },
});
