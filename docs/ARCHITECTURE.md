# KoGraph Studio Architecture

## Security Rules Implemented
- No client-side `new Date()` for subscription decisions.
- Booth access gated in middleware through Postgres RPC `check_booth_access`.
- Server actions fetch current server time from DB in WIB.
- Pakasir webhook validates local order data and re-checks remote transaction detail before settlement.
- Telegram delivery uses `sendDocument` with short-lived signed URL.

## Flow
1. Operator enters `/booth/[id]`
2. Middleware checks active subscription + kill-switch + booth ownership
3. Client captures 3 frames from Sony A6400 at 1080p60
4. Browser canvas merges 3 photos + 1 overlay
5. Final strip uploads to operator bucket in Supabase
6. Session payment created in Pakasir
7. Webhook settles order and credits wallet net amount
8. Operator can withdraw from dashboard (minimum Rp 15.000)
