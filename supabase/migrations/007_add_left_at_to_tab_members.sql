-- Migration 007 — Semi-left state for tab members
-- left_at NULL  = active member (on home screen, full access)
-- left_at SET   = semi-left (hidden from home screen, 403 on direct access,
--                 still appears in expense split lists with a visual indicator)
ALTER TABLE tab_members
    ADD COLUMN left_at TIMESTAMPTZ;
