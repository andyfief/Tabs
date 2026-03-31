import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch } from '../utils/api';

type JoinResponse = { tab_id: string; tab_name: string };

export default function JoinScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    if (code.trim().length === 0) {
      setError('Enter an invite code.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { tab_id } = await apiFetch<JoinResponse>('/invites/join', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      router.replace(`/tab/${tab_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join tab.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Join a Tab</Text>
        <Text style={styles.subtitle}>
          Enter the invite code shared by the tab creator.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="XXXXXX"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={6}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.btn} onPress={handleJoin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Join Tab</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', padding: 28 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 6,
    padding: 14, fontSize: 22, letterSpacing: 8, textAlign: 'center',
  },
  error: { color: 'red', fontSize: 13, marginTop: 12 },
  btn: {
    marginTop: 24, padding: 14, backgroundColor: '#000',
    borderRadius: 8, alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
