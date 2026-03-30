# Tech Stack

## Frontend
- **Framework:** React Native (Expo — managed workflow)
- **Rationale:** Single codebase for iOS + Android; OTA updates; speeds up early development

## Backend
- **Runtime:** Python and FastAPI
- **Host:** Railway or Render
- **Rationale:** Lightweight, fast to build, easy to deploy; serverless is overkill at this scale

## Database
- **DB:** PostgreSQL via Supabase
- **Rationale:** Relational structure maps naturally to users → tabs → expenses → balances

## Auth
- **Provider:** Supabase Auth
- **Methods:** Phone number + magic link
- **Rationale:** Handles sessions natively with the React Native SDK

## Real-Time
- **Service:** Supabase Realtime
- **Rationale:** Postgres change listeners push balance updates to connected clients without polling

## Push Notifications
- **Service:** Expo Push Notifications (backed by APNs + FCM)
- **Rationale:** Expo abstracts the Apple/Google layers cleanly

## SMS
- **Provider:** Twilio
- **Rationale:** Industry standard, reliable delivery, simple REST API
- **Cost:** ~$0.0079/message

## Payments / Paywall
- **Service:** RevenueCat + StoreKit (iOS) / Play Billing (Android)
- **Rationale:** Handles IAP receipt validation, paywalls, and entitlements across both platforms without touching Apple/Google billing directly

## Deployment
- **Backend:** Railway
- **Mobile builds:** Expo EAS (also handles app store submissions)
- **Rationale:** Low-ops, reasonable free tiers
