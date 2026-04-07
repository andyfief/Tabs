# Tabs

Full-stack mobile app for splitting group expenses in real time, with automated debt settlement via deep-linked payments and SMS on event close.

## What it does

- Create a tab for any shared event (dinner, trip, etc.) and invite others via a 6-character code
- Log expenses as they happen - each expense records who paid and splits the cost evenly across chosen members
- Balances update instantly and are always derived from the expense ledger, never stored as mutable fields
- Mark individual debts as settled; both parties see the status
- Clear a tab from your home screen when you're done with it; tabs auto-delete once every member has cleared

## Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native, Expo (managed), TypeScript |
| Backend | Python, FastAPI, Railway |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth - phone OTP |
| Real-time | Supabase Realtime (Postgres change listeners) |
| SMS | Twilio |
| Paywall | RevenueCat + StoreKit / Play Billing |

## Architecture highlights

**Ledger-based balances** - balances are never stored. A `pairwise_balances` Postgres view derives net amounts owed between every user pair by aggregating `expense_splits` rows. One canonical row per pair (enforced via `LEAST`/`GREATEST` on UUIDs) with a signed `net_balance`. Concurrent expense inserts are safe by design - each is an independent row, no read-modify-write on shared state.

**Optimistic UI with reconciliation** - the mobile client applies state changes immediately on user action and reconciles against the server response, keeping the UI snappy without sacrificing consistency.

**Background cache with validation** - tab list data is cached on the client and served instantly on navigation; cache entries are validated against the backend to catch any drift.

**Payment deep links** - Venmo and Cash App payment links are constructed server-side in a single utility so URL schemas are easy to update. Handles are sanitized (strip `@`/`$`) before link construction.

**Tab close flow** - closing a tab (paywalled via RevenueCat) is a single backend transaction: validate purchase → mark closed → compute final balances → generate payment links → fire Twilio SMS per recipient. One bad phone number cannot abort the sequence.

## Project structure

```
├── mobile/              # Expo app
│   ├── app/             # Screens (Expo Router)
│   │   ├── index.tsx          # Home - active tabs
│   │   ├── cleared-tabs.tsx   # Cleared tab archive
│   │   ├── create-tab.tsx
│   │   ├── join.tsx           # Join via invite code
│   │   ├── tab/[id]/
│   │   │   ├── index.tsx      # Tab detail - expenses, balances, settlements
│   │   │   └── add-expense.tsx
│   │   ├── phone.tsx          # Auth - phone entry
│   │   └── verify.tsx         # Auth - OTP verify
│   ├── hooks/
│   ├── utils/
│   │   ├── tabQueries.ts      # Typed API fetch functions
│   │   ├── queryClient.ts     # React Query cache config
│   │   └── paymentLinks.ts    # Deep link construction
│   └── context/
│       └── AuthContext.tsx
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── tabs.py            # Tab CRUD, clear/unlear, leave
│   │   ├── expenses.py        # Expense CRUD, balance query
│   │   ├── invites.py         # Invite code generation + join
│   │   ├── settlements.py     # Balance settlement records
│   │   └── users.py
│   ├── models/                # Pydantic request models
│   └── services/              # Supabase client, auth helpers
└── supabase/
    ├── schema.sql             # All tables + pairwise_balances view
    └── migrations/
```

## Database schema (key tables)

| Table | Purpose |
|---|---|
| `users` | Extends Supabase Auth; stores display name, phone, Venmo/Cash App handles |
| `tabs` | An event grouping a set of expenses |
| `tab_members` | Intersection table - M-M user/tab relationship, with per-user `cleared_at` |
| `expenses` | A purchase logged against a tab; soft-deleted via `removed_at` |
| `expense_splits` | One row per user sharing an expense, with their `share_amount` |
| `payments` | Self-reported "I paid you" checkbox - display state only, not authoritative |
| `pairwise_balances` | **View** - derived net balances from the expense ledger |

## Local setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in credentials
uvicorn main:app --reload
```

### Mobile

```bash
cd mobile
npm install
cp .env.example .env   # fill in credentials
npx expo start
```

### Environment variables

**`backend/.env`**
```
SUPABASE_URL
SUPABASE_API_KEY          # service role key
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
REVENUECAT_API_KEY
```

**`mobile/.env`**
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PROJECT_ID
```
