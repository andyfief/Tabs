import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const DARK_BG = '#1c1c1e';
const DARK_BORDER = '#3a3a3c';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { markProfileReady } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [venmo, setVenmo] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!displayName.trim()) {
      setError('A display name is required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          display_name: displayName.trim(),
          venmo_handle: venmo.trim() || null,
          cashapp_handle: cashapp.trim() || null,
        }),
      });
      markProfileReady();
      router.replace('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>Tell the group who you are.</Text>

        <Text style={styles.label}>Display name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#555"
          value={displayName}
          onChangeText={setDisplayName}
          autoFocus
        />

        <Text style={styles.sectionHeading}>Attach your handles</Text>
        <Text style={styles.sectionSubtitle}>
          Optional — used to generate payment links when settling up.
        </Text>

        <Text style={styles.label}>Venmo</Text>
        <TextInput
          style={styles.input}
          placeholder="@username"
          placeholderTextColor="#555"
          value={venmo}
          onChangeText={setVenmo}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Cash App</Text>
        <TextInput
          style={styles.input}
          placeholder="$username"
          placeholderTextColor="#555"
          value={cashapp}
          onChangeText={setCashapp}
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.btn} onPress={handleContinue} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Continue</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  inner: { padding: 28, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8, marginTop: 20, color: '#fff' },
  subtitle: { fontSize: 15, color: '#8e8e93', marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 16, marginBottom: 6 },
  sectionHeading: { fontSize: 17, fontWeight: '700', marginTop: 36, marginBottom: 4, color: '#fff' },
  sectionSubtitle: { fontSize: 13, color: '#8e8e93', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: DARK_BORDER, borderRadius: 6,
    padding: 10, fontSize: 15, color: '#fff',
  },
  error: { color: '#ff453a', fontSize: 13, marginTop: 14 },
  btn: {
    marginTop: 32, padding: 14, backgroundColor: DARK_BORDER,
    borderRadius: 8, alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
