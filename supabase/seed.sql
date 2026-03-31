-- ============================================================
-- Seed — Test Users + Test Tab (auth-bypass mode)
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Because users.id is a FK to auth.users, we must insert there first.
-- This seed is only for local/dev use while auth is not wired up.
-- ============================================================

-- ============================================================
-- USER 1 — a0000000-...-000000000001  ("Alex")
-- ============================================================

INSERT INTO auth.users (
    id, email, phone, created_at, updated_at, role, aud,
    encrypted_password, confirmation_token, recovery_token,
    email_change_token_new, email_change
)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'alex@tabs.dev', '+10000000001',
    NOW(), NOW(), 'authenticated', 'authenticated',
    '', '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, display_name, phone, venmo_handle, cashapp_handle)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Alex', '+10000000001', 'alexvenmo', 'alexcash'
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- USER 2 — b0000000-...-000000000002  ("Andy")
-- ============================================================

INSERT INTO auth.users (
    id, email, phone, created_at, updated_at, role, aud,
    encrypted_password, confirmation_token, recovery_token,
    email_change_token_new, email_change
)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'andy@tabs.dev', '+10000000002',
    NOW(), NOW(), 'authenticated', 'authenticated',
    '', '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, display_name, phone, venmo_handle, cashapp_handle)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'Andy', '+10000000002', 'andyvenmo', 'andycash'
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- TEST TAB — known UUID so both users are pre-membered
-- ============================================================

INSERT INTO public.tabs (id, name, description, created_by, status)
VALUES (
    'c0000000-0000-0000-0000-000000000003',
    'Test Tab',
    'Shared dev tab for Alex and Andy',
    'a0000000-0000-0000-0000-000000000001',
    'open'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tab_members (tab_id, user_id)
VALUES
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;
