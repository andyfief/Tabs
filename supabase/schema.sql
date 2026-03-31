-- ============================================================
-- Tabs — Database Schema
-- Balances are DERIVED from the expense ledger (no balance table).
-- See the pairwise_balances view at the bottom of this file.
-- ============================================================


-- ------------------------------------------------------------
-- USERS
-- Extends Supabase Auth; one row per authenticated user.
-- ------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name    TEXT        NOT NULL,
    phone           TEXT        UNIQUE NOT NULL,
    venmo_handle    TEXT,
    cashapp_handle  TEXT,
    expo_push_token TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- TABS
-- An event/occasion that groups a set of shared expenses.
-- ------------------------------------------------------------
CREATE TABLE tabs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    created_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'closed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at   TIMESTAMPTZ
);


-- ------------------------------------------------------------
-- TAB_MEMBERS
-- Junction table — which users belong to which tab.
-- ------------------------------------------------------------
CREATE TABLE tab_members (
    tab_id      UUID        NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_at  TIMESTAMPTZ,                            -- NULL = on homescreen; set = cleared by this user
    PRIMARY KEY (tab_id, user_id)
);


-- ------------------------------------------------------------
-- EXPENSES
-- A single purchase logged against a tab.
-- payer_id  — the user who physically paid.
-- created_by — the user who entered the log (may differ from payer).
-- ------------------------------------------------------------
CREATE TABLE expenses (
    id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    tab_id      UUID           NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    payer_id    UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by  UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT           NOT NULL,
    amount      NUMERIC(10,2)  NOT NULL CHECK (amount > 0),
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    removed_at  TIMESTAMPTZ                              -- NULL = active; set = soft-removed
);


-- ------------------------------------------------------------
-- EXPENSE_SPLITS
-- One row per user who shares in a given expense.
-- share_amount must sum to the parent expense's amount.
-- The payer CAN appear here (their share reduces what they're owed).
-- ------------------------------------------------------------
CREATE TABLE expense_splits (
    id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id    UUID           NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id       UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_amount  NUMERIC(10,2)  NOT NULL CHECK (share_amount > 0),
    UNIQUE (expense_id, user_id)
);


-- ------------------------------------------------------------
-- PAYMENTS
-- Records a user's self-reported "I paid you" checkbox action.
-- This is NOT authoritative for tab close — it is display-only
-- optimistic state that both parties can see.
-- ------------------------------------------------------------
CREATE TABLE payments (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tab_id        UUID        NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    payer_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    marked_paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tab_id, payer_id, recipient_id)
);


-- ============================================================
-- VIEW: pairwise_balances
--
-- Derives the net amount owed between every pair of users
-- within each tab, directly from the expense ledger.
--
-- Model (from CLAUDE.md):
--   - One row per (tab, user_a, user_b) where user_a_id < user_b_id
--     so there are never duplicate pairs.
--   - net_balance > 0  →  user_a owes user_b
--   - net_balance < 0  →  user_b owes user_a
--   - Rows where net_balance = 0 are excluded (settled pairs).
--
-- How it works:
--   For each expense, every non-payer in expense_splits owes the
--   payer their share_amount. We emit those directional debts,
--   then group by (tab, canonical pair) and net them out.
-- ============================================================
CREATE VIEW pairwise_balances AS
SELECT
    tab_id,
    LEAST(debtor_id, creditor_id)     AS user_a_id,
    GREATEST(debtor_id, creditor_id)  AS user_b_id,
    SUM(
        CASE
            WHEN debtor_id < creditor_id THEN  share_amount
            ELSE                              -share_amount
        END
    ) AS net_balance
    -- positive → user_a owes user_b
    -- negative → user_b owes user_a
FROM (
    -- Each expense_split row where the split member ≠ the payer
    -- represents a debt: split member owes payer their share.
    SELECT
        e.tab_id,
        es.user_id   AS debtor_id,
        e.payer_id   AS creditor_id,
        es.share_amount
    FROM expenses e
    JOIN expense_splits es ON es.expense_id = e.id
    WHERE es.user_id <> e.payer_id
      AND e.removed_at IS NULL
) ledger
GROUP BY
    tab_id,
    LEAST(debtor_id, creditor_id),
    GREATEST(debtor_id, creditor_id)
HAVING SUM(
    CASE
        WHEN debtor_id < creditor_id THEN  share_amount
        ELSE                              -share_amount
    END
) <> 0;
