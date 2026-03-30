beware.md is a guiderail file to help avoid pitfalls during development

Balance calculation

Never store balances as mutable fields - derive them from the expense ledger via a Postgres view or computed query. This prevents race conditions when multiple users add expenses simultaneously.

Real-time sync

Supabase Realtime listens to Postgres row changes. Subscribe at the event level, not globally. Unsubscribe when navigating away from an event screen or you will accumulate listeners.
Balance recalculation should be triggered by expense inserts/deletes only — don't poll.

Paywall enforcement

RevenueCat purchase confirmation must be validated server-side via webhook before the backend executes tab close logic. Never trust a client-sent flag that a purchase succeeded.
Tab close is a single backend transaction: mark tab closed → compute balances → generate links → fire Twilio. If any step fails, the tab should not be marked closed.

SMS orchestration on close

Each member gets a personalized message with their specific net balance and payment URL. This is a per-member loop, not a broadcast.
Handle gracefully: member has no phone number on file, Twilio delivery failure, member owes $0 (don't send them a payment link).
Wrap Twilio calls in try/except per recipient — one bad number should not abort the entire close sequence.

Deep link generation

Venmo: venmo://paycharge?txn=pay&recipients=HANDLE&amount=AMOUNT&note=Tabs
Cash App: https://cash.app/$HANDLE/AMOUNT
Isolate all link-building in a single backend utility function (generate_payment_link(platform, handle, amount)). These schemas are unofficial and subject to change.
Handles are user-supplied strings — strip @ and $ prefixes before constructing URLs.

Auth and phone identity

Supabase phone auth uses OTP via SMS — this also costs Twilio credits. Don't confuse auth SMS with tab-close SMS in cost tracking.
A user's phone number is both their auth identity and their notification target. Keep them in sync — if a user updates their number, auth and the users table must update together.

Checkbox payment state

Checkboxes ("I paid Andy") are local optimistic state that must persist to the DB. They are not authoritative — a tab is closed by the payer, not by checkbox state. Don't conflate the two.

Concurrent expense adds

Two members adding expenses at the same time is the normal case on a night out. Expense inserts should be independent rows — no read-modify-write on a shared balance field. The ledger model handles this safely; a balance field model does not.