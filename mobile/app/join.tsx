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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../utils/api';

const DARK_BG = '#1c1c1e';
const DARK_BORDER = '#3a3a3c';

type JoinResponse = { tab_id: string; tab_name: string };

export default function JoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          android_ripple={null}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.navTitle}>Join a Tab</Text>
        <View style={styles.navBtn} />
      </View>

      <View style={styles.inner}>
        <Text style={styles.subtitle}>
          Enter the invite code shared by the tab creator.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="XXXXXX"
          placeholderTextColor="#555"
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
  container: { flex: 1, backgroundColor: DARK_BG },

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

  inner: { flex: 1, justifyContent: 'center', padding: 28 },
  subtitle: { fontSize: 15, color: '#8e8e93', marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: DARK_BORDER, borderRadius: 6,
    padding: 14, fontSize: 22, letterSpacing: 8, textAlign: 'center', color: '#fff',
  },
  error: { color: '#ff453a', fontSize: 13, marginTop: 12 },
  btn: {
    marginTop: 24, padding: 14, backgroundColor: DARK_BORDER,
    borderRadius: 8, alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
