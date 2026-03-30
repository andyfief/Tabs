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

type TabResponse = { id: string };

export default function CreateTabScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
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
        value={name}
        onChangeText={setName}
        autoFocus
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Optional"
        value={description}
        onChangeText={setDescription}
        multiline
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
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  error: { color: 'red', fontSize: 13, marginTop: 12 },
  button: {
    marginTop: 24,
    padding: 14,
    backgroundColor: '#000',
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
