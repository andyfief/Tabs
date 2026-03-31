-- Add ON DELETE CASCADE to all foreign keys that reference users(id).
-- This allows a user row to be deleted (e.g. during dev resets) without
-- manually clearing dependent rows first.

-- tabs.created_by
ALTER TABLE tabs
    DROP CONSTRAINT tabs_created_by_fkey,
    ADD CONSTRAINT tabs_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- expenses.payer_id
ALTER TABLE expenses
    DROP CONSTRAINT expenses_payer_id_fkey,
    ADD CONSTRAINT expenses_payer_id_fkey
        FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE;

-- expenses.created_by
ALTER TABLE expenses
    DROP CONSTRAINT expenses_created_by_fkey,
    ADD CONSTRAINT expenses_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- expense_splits.user_id
ALTER TABLE expense_splits
    DROP CONSTRAINT expense_splits_user_id_fkey,
    ADD CONSTRAINT expense_splits_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- payments.payer_id
ALTER TABLE payments
    DROP CONSTRAINT payments_payer_id_fkey,
    ADD CONSTRAINT payments_payer_id_fkey
        FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE;

-- payments.recipient_id
ALTER TABLE payments
    DROP CONSTRAINT payments_recipient_id_fkey,
    ADD CONSTRAINT payments_recipient_id_fkey
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;

-- tab_invites.created_by
ALTER TABLE tab_invites
    DROP CONSTRAINT tab_invites_created_by_fkey,
    ADD CONSTRAINT tab_invites_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
