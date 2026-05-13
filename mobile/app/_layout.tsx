import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../utils/supabase';
import { apiFetch } from '../utils/api';
import { queryClient } from '../utils/queryClient';
import { AuthContext } from '../context/AuthContext';
import { fetchAllTabs, fetchTabDetail } from '../utils/tabQueries';

const LOADING_MESSAGES = [
  'Calculating who owes what…',
  'Splitting the bill…',
  'Checking your tabs…',
  'Tallying up expenses…',
  'Almost there…',
  'Waking up the backend…',
  'Loading your tabs…',
  'Counting every cent…',
];

function LoadingScreen() {
  const progress = useRef(new Animated.Value(0)).current;
  const message = useRef(
    LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]
  ).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: false,
      })
    ).start();
  }, [progress]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={loadingStyles.container}>
      <Image
        source={require('../assets/Tabs_Logo_400x400.png')}
        style={loadingStyles.logo}
        resizeMode="contain"
      />
      <View style={loadingStyles.barTrack}>
        <Animated.View style={[loadingStyles.barFill, { width: barWidth }]} />
      </View>
      <Text style={loadingStyles.message}>{message}</Text>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: 48,
  },
  barTrack: {
    width: '100%',
    height: 2,
    backgroundColor: '#333',
    borderRadius: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  message: {
    marginTop: 16,
    fontSize: 13,
    color: '#8e8e93',
    textAlign: 'center',
  },
});

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
      // Fetch the tab list and all tab details before revealing the home screen
      // so navigating into any tab is instant with no spinner.
      const tabs = await queryClient.fetchQuery({
        queryKey: ['tabs'],
        queryFn: fetchAllTabs,
      });
      await Promise.all(
        tabs.map((tab) =>
          queryClient.prefetchQuery({
            queryKey: ['tab', tab.id],
            queryFn: () => fetchTabDetail(tab.id),
          })
        )
      );
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

  return (
    <QueryClientProvider client={queryClient}>
    <AuthContext.Provider value={{ markProfileReady: () => setAuthState('ready') }}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      {authState === 'loading' ? (
        <LoadingScreen />
      ) : (
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
          <Stack.Screen name="index" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="create-tab" options={{ headerShown: false }} />
          <Stack.Screen name="join" options={{ headerShown: false }} />
          <Stack.Screen name="cleared-tabs" options={{ headerShown: false }} />
          <Stack.Screen name="tab/[id]/index" options={{ headerShown: false }} />
          <Stack.Screen name="tab/[id]/add-expense" options={{ headerShown: false }} />
          <Stack.Screen name="tab/[id]/edit-expense" options={{ headerShown: false }} />
        </Stack>
      )}
    </GestureHandlerRootView>
    </AuthContext.Provider>
    </QueryClientProvider>
  );
}
