import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'My Tabs' }} />
        <Stack.Screen name="create-tab" options={{ title: 'New Tab' }} />
        <Stack.Screen name="tab/[id]/index" options={{ title: 'Tab' }} />
        <Stack.Screen name="tab/[id]/add-expense" options={{ title: 'Add Expense' }} />
        <Stack.Screen name="cleared-tabs" options={{ title: 'Cleared Tabs' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
