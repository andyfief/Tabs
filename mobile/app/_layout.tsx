import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'My Tabs' }} />
      <Stack.Screen name="create-tab" options={{ title: 'New Tab' }} />
      <Stack.Screen name="tab/[id]" options={{ title: 'Tab' }} />
    </Stack>
  );
}
