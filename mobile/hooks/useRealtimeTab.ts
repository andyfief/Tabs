import { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { queryClient } from '../utils/queryClient';

export function useRealtimeTab(tabId: string | null) {
  useEffect(() => {
    if (!tabId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['tab', tabId], refetchType: 'all' });
    };

    const channel = supabase
      .channel(`tab:${tabId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `tab_id=eq.${tabId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_members', filter: `tab_id=eq.${tabId}` }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tabId]);
}
