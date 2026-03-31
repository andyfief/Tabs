-- Tracks individual balance settlement events recorded by a tab member.
-- Each row is a snapshot: "I (initiator) settled $X with counterpart at this moment."
-- restored_at NULL  → settlement is active (shown greyed at bottom of balances panel).
-- restored_at SET   → user restored it; shows as a separate active row tagged
--                     "previously settled", no longer subtracted from outstanding.
CREATE TABLE balance_settlements (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    tab_id          UUID           NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    initiator_id    UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    counterpart_id  UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    -- True  = initiator owed counterpart (initiator paid out).
    -- False = counterpart owed initiator (initiator requested / received).
    i_owe           BOOLEAN        NOT NULL,
    settled_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    restored_at     TIMESTAMPTZ
);
