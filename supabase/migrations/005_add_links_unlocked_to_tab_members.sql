-- Add per-user, per-tab flag for when balance payment links are unlocked.
-- NULL = not yet unlocked; set = user has unlocked (one-time, irreversible).
ALTER TABLE tab_members
    ADD COLUMN links_unlocked_at TIMESTAMPTZ;
