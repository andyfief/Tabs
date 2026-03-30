-- ============================================================
-- Seed — Test User (auth-bypass mode)
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Because users.id is a FK to auth.users, we must insert there first.
-- This seed is only for local/dev use while auth is not wired up.
-- ============================================================

-- Step 1: Insert a minimal row into Supabase's internal auth.users table
INSERT INTO auth.users (
    id,
    email,
    phone,
    created_at,
    updated_at,
    role,
    aud,
    encrypted_password,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'test@tabs.dev',
    '+10000000000',
    NOW(),
    NOW(),
    'authenticated',
    'authenticated',
    '',  -- no real password needed
    '',
    '',
    '',
    ''
)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Insert the user's public profile
INSERT INTO public.users (id, display_name, phone, venmo_handle, cashapp_handle)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Test User',
    '+10000000000',
    'testuser',
    '$testuser'
)
ON CONFLICT (id) DO NOTHING;
