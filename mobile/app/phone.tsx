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
import { supabase } from '../utils/supabase';

export default function PhoneScreen() {
  const router = useRouter();
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const digits = number.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Enter a 10-digit US phone number.');
      return;
    }
    const phone = `+1${digits}`;
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push({ pathname: '/verify', params: { phone } });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Welcome to Tabs</Text>
        <Text style={styles.subtitle}>Enter your phone number to get started.</Text>

        <View style={styles.inputRow}>
          <View style={styles.prefix}>
            <Text style={styles.prefixText}>🇺🇸 +1</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="(555) 000-0000"
            value={number}
            onChangeText={setNumber}
            keyboardType="number-pad"
            maxLength={14}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.btn} onPress={handleSend} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Send Code</Text>}
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
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefix: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 11,
  },
  prefixText: { fontSize: 15 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ccc',
    borderRadius: 6, padding: 10, fontSize: 15,
  },
  error: { color: 'red', fontSize: 13, marginTop: 12 },
  btn: {
    marginTop: 24, padding: 14, backgroundColor: '#000',
    borderRadius: 8, alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
