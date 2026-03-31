-- Migration 003 — Tab invite codes
-- Run in Supabase SQL editor.
--
-- One code per tab. Multi-use, no expiry.
-- Any tab member can retrieve/generate the code.

CREATE TABLE IF NOT EXISTS tab_invites (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tab_id      UUID        NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    code        TEXT        UNIQUE NOT NULL,
    created_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tab_id)          -- one code per tab
);

CREATE INDEX IF NOT EXISTS tab_invites_code_idx ON tab_invites (code);
