import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import type { Tab, Expense, TabDetailFull, BalanceSettlement } from '../utils/tabQueries';

// ─── Cache key helpers ────────────────────────────────────────────────────────

const TABS_KEY = ['tabs'] as const;
const tabKey = (id: string) => ['tab', id] as const;
const tabResolveKey = (id: string) => ['tab-resolve', id] as const;

// ─── useCreateTab ─────────────────────────────────────────────────────────────
// tempId generated at call site so router.push can fire synchronously after mutate().
// onMutate is synchronous (no await) so cache is seeded before navigation resolves.

type CreateTabInput = { name: string; tempId: string };

export function useCreateTab() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: CreateTabInput) =>
      apiFetch<{ id: string; created_at: string }>('/tabs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onMutate: ({ name, tempId }: CreateTabInput) => {
      queryClient.cancelQueries({ queryKey: TABS_KEY });
      const previous = queryClient.getQueryData<Tab[]>(TABS_KEY);
      queryClient.setQueryData<Tab[]>(TABS_KEY, (prev = []) => [
        ...prev,
        { id: tempId, name, description: null, member_count: 1, created_at: new Date().toISOString(), is_cleared: false },
      ]);
      queryClient.setQueryData<TabDetailFull>(tabKey(tempId), {
        tab: { id: tempId, name, description: null, status: 'open', members: [], links_unlocked: false },
        expenses: [],
        balances: [],
        settlements: [],
      });
      return { previous, tempId };
    },
    onSuccess: (created, _vars, ctx) => {
      const { tempId } = ctx!;
      queryClient.setQueryData(tabKey(created.id), queryClient.getQueryData(tabKey(tempId)));
      queryClient.setQueryData<Tab[]>(TABS_KEY, (prev = []) =>
        prev.map((t) => (t.id === tempId ? { ...t, id: created.id, created_at: created.created_at } : t))
      );
      queryClient.setQueryData(tabResolveKey(tempId), created.id);
    },
    onError: (_err, { tempId }, ctx) => {
      queryClient.setQueryData(TABS_KEY, ctx?.previous);
      queryClient.removeQueries({ queryKey: tabKey(tempId) });
    },
  });
}

// ─── useClearTab ──────────────────────────────────────────────────────────────
// Two-phase: mutate() fires the API (onAction), commit() updates the cache (onCommit).
// onError restores the pre-commit snapshot if the API fails after the row disappears.

export function useClearTab() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (tabId: string) => apiFetch(`/tabs/${tabId}/clear`, { method: 'PATCH' }),
    onMutate: async (tabId: string) => {
      await queryClient.cancelQueries({ queryKey: TABS_KEY });
      const previous = queryClient.getQueryData<Tab[]>(TABS_KEY);
      return { previous };
    },
    onError: (_err, _tabId, ctx) => {
      queryClient.setQueryData(TABS_KEY, ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TABS_KEY });
    },
  });

  const commit = useCallback((tabId: string) => {
    queryClient.setQueryData<Tab[]>(TABS_KEY, (prev = []) =>
      prev.map((t) => (t.id === tabId ? { ...t, is_cleared: true } : t))
    );
  }, [queryClient]);

  return { mutate: mutation.mutate, commit };
}

// ─── useRestoreTab ────────────────────────────────────────────────────────────

export function useRestoreTab() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (tabId: string) => apiFetch(`/tabs/${tabId}/clear`, { method: 'PATCH' }),
    onMutate: async (tabId: string) => {
      await queryClient.cancelQueries({ queryKey: TABS_KEY });
      const previous = queryClient.getQueryData<Tab[]>(TABS_KEY);
      return { previous };
    },
    onError: (_err, _tabId, ctx) => {
      queryClient.setQueryData(TABS_KEY, ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TABS_KEY });
    },
  });

  const commit = useCallback((tabId: string) => {
    queryClient.setQueryData<Tab[]>(TABS_KEY, (prev = []) =>
      prev.map((t) => (t.id === tabId ? { ...t, is_cleared: false } : t))
    );
  }, [queryClient]);

  return { mutate: mutation.mutate, commit };
}

// ─── useToggleExpense ─────────────────────────────────────────────────────────
// Called from onAction — full optimistic update happens immediately (no commit phase).
// onMutate is synchronous so the cache flips before the swipe gesture finishes.

export function useToggleExpense(tabId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) =>
      apiFetch(`/tabs/${tabId}/expenses/${expenseId}`, { method: 'PATCH' }),
    onMutate: (expenseId: string) => {
      queryClient.cancelQueries({ queryKey: tabKey(tabId) });
      const previous = queryClient.getQueryData<TabDetailFull>(tabKey(tabId));
      const now = new Date().toISOString();
      queryClient.setQueryData<TabDetailFull>(tabKey(tabId), (old) => {
        if (!old) return old;
        const toggled = old.expenses.map((e) =>
          e.id === expenseId ? { ...e, removed_at: e.removed_at === null ? now : null } : e
        );
        const active = toggled
          .filter((e) => e.removed_at === null)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        const removed = toggled
          .filter((e) => e.removed_at !== null)
          .sort((a, b) => b.removed_at!.localeCompare(a.removed_at!));
        return { ...old, expenses: [...active, ...removed] };
      });
      return { previous };
    },
    onError: (_err, _expenseId, ctx) => {
      queryClient.setQueryData(tabKey(tabId), ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tabKey(tabId) });
    },
  });
}

// ─── useUnlockLinks ───────────────────────────────────────────────────────────
// Eliminates the linksUnlocked useState/useEffect — reads data?.tab.links_unlocked directly.

export function useUnlockLinks(tabId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/tabs/${tabId}/unlock-balance-links`, { method: 'POST' }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: tabKey(tabId) });
      const previous = queryClient.getQueryData<TabDetailFull>(tabKey(tabId));
      queryClient.setQueryData<TabDetailFull>(tabKey(tabId), (old) => {
        if (!old) return old;
        return { ...old, tab: { ...old.tab, links_unlocked: true } };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(tabKey(tabId), ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tabKey(tabId) });
    },
  });
}

// ─── useCreateSettlement ──────────────────────────────────────────────────────
// Linking.openURL is called in the component before mutate() — hook is URL-agnostic.
// tempId generated at call site so the component controls it.

type CreateSettlementInput = {
  counterpartId: string;
  counterpartName: string;
  amount: number;
  iOwe: boolean;
  initiatorId: string;
  initiatorName: string;
  tempId: string;
};

export function useCreateSettlement(tabId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ counterpartId, amount, iOwe }: CreateSettlementInput) =>
      apiFetch<BalanceSettlement>(`/tabs/${tabId}/balance-settlements`, {
        method: 'POST',
        body: JSON.stringify({ counterpart_id: counterpartId, amount, i_owe: iOwe }),
      }),
    onMutate: async (vars: CreateSettlementInput) => {
      await queryClient.cancelQueries({ queryKey: tabKey(tabId) });
      const previous = queryClient.getQueryData<TabDetailFull>(tabKey(tabId));
      const optimistic: BalanceSettlement = {
        id: vars.tempId,
        initiator_id: vars.initiatorId,
        initiator_name: vars.initiatorName,
        counterpart_id: vars.counterpartId,
        counterpart_name: vars.counterpartName,
        amount: vars.amount,
        i_owe: vars.iOwe,
        settled_at: new Date().toISOString(),
        restored_at: null,
      };
      queryClient.setQueryData<TabDetailFull>(tabKey(tabId), (old) => {
        if (!old) return old;
        return { ...old, settlements: [...old.settlements, optimistic] };
      });
      return { previous, tempId: vars.tempId };
    },
    onSuccess: (result, _vars, ctx) => {
      queryClient.setQueryData<TabDetailFull>(tabKey(tabId), (old) => {
        if (!old) return old;
        return {
          ...old,
          settlements: old.settlements.map((s) => (s.id === ctx!.tempId ? result : s)),
        };
      });
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(tabKey(tabId), ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tabKey(tabId) });
    },
  });
}

// ─── useRestoreSettlement ─────────────────────────────────────────────────────
// Two-phase: mutate() fires the API (onAction), commit() sets restored_at (onCommit).

export function useRestoreSettlement(tabId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (settlementId: string) =>
      apiFetch(`/tabs/${tabId}/balance-settlements/${settlementId}/restore`, { method: 'PATCH' }),
    onMutate: async (settlementId: string) => {
      await queryClient.cancelQueries({ queryKey: tabKey(tabId) });
      const previous = queryClient.getQueryData<TabDetailFull>(tabKey(tabId));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(tabKey(tabId), ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tabKey(tabId) });
    },
  });

  const commit = useCallback((settlementId: string) => {
    const now = new Date().toISOString();
    queryClient.setQueryData<TabDetailFull>(tabKey(tabId), (old) => {
      if (!old) return old;
      return {
        ...old,
        settlements: old.settlements.map((s) =>
          s.id === settlementId ? { ...s, restored_at: now } : s
        ),
      };
    });
  }, [queryClient, tabId]);

  return { mutate: mutation.mutate, commit };
}

// ─── useReSettleBalance ───────────────────────────────────────────────────────
// Linking.openURL is called in the component before mutate().

export function useReSettleBalance(tabId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) =>
      apiFetch(`/tabs/${tabId}/balance-settlements/${settlementId}/resettle`, { method: 'PATCH' }),
    onMutate: async (settlementId: string) => {
      await queryClient.cancelQueries({ queryKey: tabKey(tabId) });
      const previous = queryClient.getQueryData<TabDetailFull>(tabKey(tabId));
      queryClient.setQueryData<TabDetailFull>(tabKey(tabId), (old) => {
        if (!old) return old;
        return {
          ...old,
          settlements: old.settlements.map((s) =>
            s.id === settlementId ? { ...s, restored_at: null } : s
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(tabKey(tabId), ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tabKey(tabId) });
    },
  });
}

// ─── useAddExpense ────────────────────────────────────────────────────────────
// Injects an optimistic expense before navigating back; invalidates on success.
// onMutate is synchronous so the cache update lands before the tab detail re-renders.
// tempId and payerName are generated at call site so the component controls them.

type AddExpenseInput = {
  title: string;
  amount: number;
  payerId: string;
  splitMemberIds: string[];
  tempId: string;
  payerName: string;
};

export function useAddExpense(tabId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: AddExpenseInput) =>
      apiFetch(`/tabs/${tabId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          title: vars.title,
          amount: vars.amount,
          payer_id: vars.payerId,
          split_member_ids: vars.splitMemberIds,
        }),
      }),
    onMutate: (vars: AddExpenseInput) => {
      queryClient.cancelQueries({ queryKey: tabKey(tabId) });
      const previous = queryClient.getQueryData<TabDetailFull>(tabKey(tabId));
      const optimistic: Expense = {
        id: vars.tempId,
        title: vars.title,
        amount: vars.amount,
        payer_name: vars.payerName,
        created_at: new Date().toISOString(),
        removed_at: null,
      };
      queryClient.setQueryData<TabDetailFull>(tabKey(tabId), (old) => {
        if (!old) return old;
        return { ...old, expenses: [optimistic, ...old.expenses] };
      });
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tabKey(tabId) });
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(tabKey(tabId), ctx?.previous);
    },
  });
}
