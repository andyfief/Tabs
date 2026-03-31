import { useRef, useState } from 'react';
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
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../utils/supabase';

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  // Navigation after verify is handled by _layout.tsx watching auth state
  async function handleVerify() {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your SMS.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    setLoading(false);
    if (error) {
      setError(error.message);
    }
    // On success: onAuthStateChange in _layout.tsx handles navigation
  }

  async function handleResend() {
    await supabase.auth.signInWithOtp({ phone });
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Check your texts</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to {phone}.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="000000"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.btn} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLabel}>Verify</Text>}
        </Pressable>

        <Pressable style={styles.resendBtn} onPress={handleResend}>
          <Text style={styles.resendLabel}>
            {resent ? 'Code resent!' : 'Resend code'}
          </Text>
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
  resendBtn: { marginTop: 16, alignItems: 'center', padding: 8 },
  resendLabel: { color: '#888', fontSize: 14 },
});
