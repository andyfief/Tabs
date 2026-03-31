import { apiFetch } from './api';

// ─── Shared types ─────────────────────────────────────────────

export type Member = { user_id: string; display_name: string };

export type TabDetail = {
  id: string;
  name: string;
  description: string | null;
  status: 'open' | 'closed';
  members: Member[];
};

export type Expense = {
  id: string;
  title: string;
  amount: number;
  payer_name: string;
  created_at: string;
  removed_at: string | null;
};

// Balances come from the pairwise_balances Postgres view — never computed client-side.
export type Balance = {
  user_a_id: string;
  user_a_name: string;
  user_b_id: string;
  user_b_name: string;
  net_balance: number;
};

export type TabDetailFull = {
  tab: TabDetail;
  expenses: Expense[];
  balances: Balance[];
};

// ─── Query function ───────────────────────────────────────────

/** Single call that fetches everything the Tab detail screen needs. */
export async function fetchTabDetail(tabId: string): Promise<TabDetailFull> {
  const [tab, expenses, balances] = await Promise.all([
    apiFetch<TabDetail>(`/tabs/${tabId}`),
    apiFetch<Expense[]>(`/tabs/${tabId}/expenses`),
    apiFetch<Balance[]>(`/tabs/${tabId}/expenses/balances`),
  ]);
  return { tab, expenses, balances };
}
