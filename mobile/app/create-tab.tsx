import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch } from '../utils/api';

const DARK_BG = '#1c1c1e';
const DARK_BORDER = '#3a3a3c';

type TabResponse = { id: string };

export default function CreateTabScreen() {
  const router = useRouter();
  const [name, setName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError('Tab name is required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const tab = await apiFetch<TabResponse>('/tabs', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      router.replace(`/tab/${tab.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Name *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Bar crawl"
        placeholderTextColor="#555"
        value={name}
        onChangeText={setName}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleCreate} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>Create Tab</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: DARK_BG },
  label: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginBottom: 4, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: DARK_BORDER,
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    color: '#fff',
  },
  error: { color: '#ff453a', fontSize: 13, marginTop: 12 },
  button: {
    marginTop: 24,
    padding: 14,
    backgroundColor: DARK_BORDER,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
