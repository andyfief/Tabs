# CLAUDE.md — Development Guide

## Project Overview
A mobile expense-splitting app built with Expo (React Native) + FastAPI + Supabase.
Users create tabs, log shared expenses, track real-time balances, and settle up via Venmo/Cash App deep links. Tab closing is paywalled via RevenueCat.

---

## Environment Variables

### `backend/.env`
```
SUPABASE_URL
SUPABASE_API_KEY          # Supabase Secret key (service role — backend only)
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
REVENUECAT_API_KEY
REVENUECAT_WEBHOOK_SECRET
```

### `mobile/.env`
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY   # Supabase Publishable key (safe for client)
EXPO_PROJECT_ID                 # Set after expo init
```

---

## Tech Stack
- **Mobile:** React Native, Expo managed workflow, TypeScript
- **Backend:** Python, FastAPI, hosted on Railway
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth (phone OTP + magic link)
- **Real-time:** Supabase Realtime (Postgres change listeners)
- **SMS:** Twilio
- **Push Notifications:** Expo Push Notifications (APNs + FCM)
- **Paywall:** RevenueCat + StoreKit / Play Billing

---

## Code Style

### General
- Readability over clever syntax — if it needs a comment to explain, simplify it first
- Small, focused functions; if a function is growing, or has lots of args, split it
- Brief, explanatory comments only where the intent isn't obvious from the code itself
- Docstrings only on non-trivial functions — one or two lines is usually enough

### Python (Backend)
- Type hints on all function signatures
- Use dataclasses or Pydantic models for structured data — no raw dicts passed between functions
- Prefer `snake_case` throughout
- Keep route handlers thin — delegate logic to helper functions
- Wrap external service calls (Twilio, RevenueCat) in their own utility modules

### TypeScript (Mobile)
- Functional components only, no class components
- Prefer `const` always
- Keep component files focused — one screen or one reusable component per file
- Extract repeated logic into `/hooks` or `/utils`, not inline

---

## Architecture Notes

### Balances
- **Never store balances as a mutable field.** Balances are derived from the expense ledger via a Postgres view.
- One balance per user pair: For N users, store (N*N-1)/2 signed balances; positive = first user owes second, negative = second owes first, no duplicates per pair.
- Net positive = owed money. Net negative = owes money.
- Recalculate on expense insert/delete only — no polling.

### Real-time
- Subscribe to Supabase Realtime at the event/tab level, not globally.
- Always unsubscribe when navigating away from a tab screen to prevent listener accumulation.

### Tab Close (Paywall)
- RevenueCat purchase must be validated server-side via webhook before any close logic runs. Never trust a client-sent success flag.
- Tab close is a single backend transaction: validate purchase → mark closed → compute balances → generate payment links → fire Twilio SMS. If any step fails, the tab stays open.
- Twilio calls are wrapped per recipient — one bad number must not abort the entire sequence.

### Payment Deep Links
- All link construction lives in one backend utility: `generate_payment_link(platform, handle, amount)`
- Strip `@` and `$` prefixes from user-supplied handles before building URLs
- Venmo: `venmo://paycharge?txn=pay&recipients=HANDLE&amount=AMOUNT&note=Tabs`
- Cash App: `https://cash.app/$HANDLE/AMOUNT`
- These schemas are unofficial — isolate them so they're easy to update

### Auth & Phone Numbers
- A user's phone number is both their auth identity and their SMS notification target
- If a user updates their phone number, both Supabase Auth and the `users` table must update together

### Checkboxes
- Checkbox "paid" state is optimistic local state that persists to the DB
- Checkboxes are **not** authoritative for tab close — a tab is closed by the creator via the paywall flow only
- When a user checks a debt as paid, it is visible to the recipient for personal verification but does not remove the debt from the recipient's view

### Concurrent Expense Adds
- Expense inserts are independent rows — never read-modify-write on a shared balance field
- The ledger model handles concurrency safely by design

---

## Project Structure (target)
```
/
├── mobile/          # Expo app
│   ├── app/         # Screens (Expo Router)
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── .env
├── backend/
│   ├── main.py
│   ├── routers/
│   ├── services/    # Twilio, RevenueCat, Supabase clients
│   ├── models/      # Pydantic models
│   └── .env
└── supabase/
    └── schema.sql   # All table definitions + balance view
```

---

## What Not to Build (yet)
- Don't add Railway deployment config until the backend is functional locally
- Don't wire `REVENUECAT_WEBHOOK_SECRET` until Phase 5 (tab close)
- Don't add `EXPO_PROJECT_ID` until `expo init` is run and the project is registered