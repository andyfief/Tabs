import { QueryClient } from '@tanstack/react-query';

// How long prefetched tab data is considered fresh before a background refetch triggers.
// Raise this to reduce fetches; lower it to keep data more current.
export const TAB_DETAIL_STALE_TIME = 30_000;

export const queryClient = new QueryClient();
