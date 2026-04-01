import { apiFetch } from './api';

// ─── Shared types ─────────────────────────────────────────────

export type Member = {
  user_id: string;
  display_name: string;
  venmo_handle: string | null;
  cashapp_handle: string | null;
};

export type TabDetail = {
  id: string;
  name: string;
  description: string | null;
  status: 'open' | 'closed';
  members: Member[];
  links_unlocked: boolean;
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

// A single settlement event recorded by the current user.
// restored_at null  → settled (shown greyed at bottom).
// restored_at set   → user restored it; shown as a separate active row.
export type BalanceSettlement = {
  id: string;
  initiator_id: string;
  initiator_name: string;
  counterpart_id: string;
  counterpart_name: string;
  amount: number;
  i_owe: boolean;
  settled_at: string;
  restored_at: string | null;
};

export type TabDetailFull = {
  tab: TabDetail;
  expenses: Expense[];
  balances: Balance[];
  settlements: BalanceSettlement[];
};

// ─── Query function ───────────────────────────────────────────

/** Single call that fetches everything the Tab detail screen needs. */
export async function fetchTabDetail(tabId: string): Promise<TabDetailFull> {
  const [tab, expenses, balances, settlements] = await Promise.all([
    apiFetch<TabDetail>(`/tabs/${tabId}`),
    apiFetch<Expense[]>(`/tabs/${tabId}/expenses`),
    apiFetch<Balance[]>(`/tabs/${tabId}/expenses/balances`),
    apiFetch<BalanceSettlement[]>(`/tabs/${tabId}/balance-settlements`),
  ]);
  return { tab, expenses, balances, settlements };
}
