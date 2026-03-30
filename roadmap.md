# Project Roadmap

## Phase 0 — Project Setup
> Foundation before any feature work begins.

- [ ] Initialize repo and version control
- [ ] Choose and scaffold mobile framework (e.g. React Native / Expo)
- [ ] Set up backend (e.g. Node/Express or Firebase)
- [ ] Configure database (real-time capable — e.g. Firestore or Supabase)
- [ ] Set up authentication provider (e.g. Firebase Auth)
- [ ] Configure push notification service (e.g. Firebase Cloud Messaging)
- [ ] Set up SMS provider (e.g. Twilio)
- [ ] Configure in-app purchase / subscription service (e.g. RevenueCat)
- [ ] Set up CI/CD pipeline and environments (dev / staging / prod)
- [ ] Define and document data models (User, Tab, Expense, Balance)

---

## Phase 1 — Auth & Onboarding
> Users can create accounts and connect payment handles.

**Priority: Critical**

- [ ] User registration and login (email or phone)
- [ ] Onboarding flow: connect Venmo or Cash App handle
- [ ] Allow skipping payment handle setup and adding it later
- [ ] Basic profile screen to update payment handles post-onboarding

---

## Phase 2 — Tabs (Core Loop)
> Users can create tabs, invite members, and view them.

**Priority: Critical**

- [ ] Create a tab with a name and description
- [ ] Invite members to a tab via link or username
- [ ] Join a tab via invite
- [ ] View all members of a tab
- [ ] Home screen: list of all open tabs for the current user

---

## Phase 3 — Expense Logging
> The core value: logging and splitting expenses.

**Priority: Critical**

- [ ] Log an expense with: title, amount, payer, and selected split members
- [ ] Default the expense creator as payer; auto-include them in the split
- [ ] Allow creator to remove themselves from the split
- [ ] Even split calculation across selected members
- [ ] Expense list view within a tab

---

## Phase 4 — Balances
> Real-time net balance tracking with simplified debt resolution.

**Priority: High**

- [ ] Calculate net balances per member within a tab in real time
- [ ] Simplify balances so each person owes at most one other person one amount (debt consolidation algorithm)
- [ ] Display who owes what to whom within a tab
- [ ] Home screen: consolidated owe/owed summary across all tabs
- [ ] Mark a payment as paid (checkbox); update balances accordingly

---

## Phase 5 — Tab Close & Paywall
> Monetization and end-of-event settlement flow.

**Priority: High**

- [ ] Paywall gate on tab close (one-time purchase or subscription)
- [ ] Integrate in-app purchase: one-time tab close option
- [ ] Integrate subscription: unlimited tab closes
- [ ] On close: generate Venmo and Cash App deep-link payment URLs per member with an outstanding balance
- [ ] On close: send SMS to every member with their balance and payment link
- [ ] On close: send push notification to all tab members

---

## Phase 6 — Polish & Edge Cases
> Quality of life improvements and hardening.

**Priority: Medium**

- [ ] Handle member leaving a tab (redistribute or freeze their balance)
- [ ] Edit or delete an expense
- [ ] Expense activity feed / audit log within a tab
- [ ] Empty states for new users and empty tabs
- [ ] Input validation and error handling throughout
- [ ] Offline-friendly UX with optimistic updates

---

## Phase 7 — Launch Readiness
> App store submission and production hardening.

**Priority: Medium**

- [ ] App icon, splash screen, and branding
- [ ] App Store and Google Play store listings
- [ ] Privacy policy and terms of service
- [ ] Rate limiting and abuse prevention on backend
- [ ] Performance testing with large tabs (many members, many expenses)
- [ ] Beta testing with real users
