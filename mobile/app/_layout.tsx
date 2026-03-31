import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { apiFetch } from '../utils/api';
import { queryClient } from '../utils/queryClient';
import { AuthContext } from '../context/AuthContext';

type AuthState = 'loading' | 'unauthenticated' | 'needs-profile' | 'ready';

const AUTH_SCREENS = ['phone', 'verify', 'profile-setup'];

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [authState, setAuthState] = useState<AuthState>('loading');
  // Prevent the profile check from running on every focus cycle
  const profileChecked = useRef(false);

  const checkProfile = useCallback(async () => {
    try {
      await apiFetch('/users/me');
      setAuthState('ready');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      setAuthState(msg.includes('404') ? 'needs-profile' : 'ready');
    }
  }, []);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_SKIP_AUTH === 'true') {
      setAuthState('ready');
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        setAuthState('unauthenticated');
        return;
      }
      checkProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (!session) {
        setAuthState('unauthenticated');
        profileChecked.current = false;
        return;
      }
      if (event === 'SIGNED_IN') {
        profileChecked.current = false;
        checkProfile();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkProfile]);

  // Redirect based on auth state changes
  useEffect(() => {
    if (authState === 'loading') return;

    const onAuthScreen = AUTH_SCREENS.includes(segments[0] as string);

    if (authState === 'unauthenticated' && !onAuthScreen) {
      router.replace('/phone');
    } else if (authState === 'needs-profile' && segments[0] !== 'profile-setup') {
      router.replace('/profile-setup');
    } else if (authState === 'ready' && onAuthScreen) {
      router.replace('/');
    }
  }, [authState, segments, router]);

  if (authState === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
    <AuthContext.Provider value={{ markProfileReady: () => setAuthState('ready') }}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1c1c1e' },
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff' },
          contentStyle: { backgroundColor: '#1c1c1e' },
        }}
      >
        {/* Auth screens — no header */}
        <Stack.Screen name="phone" options={{ headerShown: false }} />
        <Stack.Screen name="verify" options={{ headerShown: false }} />
        <Stack.Screen name="profile-setup" options={{ headerShown: false }} />

        {/* App screens */}
        <Stack.Screen name="index" options={{ title: 'My Tabs', headerBackVisible: false, gestureEnabled: false, headerTitleAlign: 'center' }} />
        <Stack.Screen name="create-tab" options={{ title: 'New Tab' }} />
        <Stack.Screen name="join" options={{ title: 'Join a Tab' }} />
        <Stack.Screen name="cleared-tabs" options={{ title: 'Cleared Tabs' }} />
        <Stack.Screen name="tab/[id]/index" options={{ title: 'Tab' }} />
        <Stack.Screen name="tab/[id]/add-expense" options={{ title: 'Add Expense' }} />
      </Stack>
    </GestureHandlerRootView>
    </AuthContext.Provider>
    </QueryClientProvider>
  );
}
