# KoGraph Studio — Production Scaffold

KoGraph Studio is a production-oriented Next.js 14 + Supabase photobooth SaaS scaffold.

## Included
- Next.js 14 App Router structure for `/admin`, `/dashboard`, `/booth/[id]`
- Supabase Postgres schema + RLS + storage isolation policies
- Middleware subscription gate for booth runtime
- Server actions for subscription checks, session draft creation, withdrawal requests, overlay registration
- Sony A6400 camera hook with explicit 1080p60 constraints and cleanup logic
- Browser canvas compositor for `1 session = 3 photos = 1 overlay`
- Pakasir billing service and webhook verification flow
- Telegram webhook + sendDocument high-resolution delivery path
- Production docs and sample assets pack (>30 MB zip target)

## Setup
1. Copy `.env.example` to `.env.local`
2. Run the SQL migration inside Supabase SQL editor
3. Create storage buckets per operator using `ensureUserBucket()` server helper or the admin onboarding flow
4. Start app with `npm install && npm run dev`

## Camera Notes
Ask operators to set Sony A6400:
- HDMI Info Display: OFF
- USB Connection: PC Remote


Lite production artifact created to stay above 30MB but reduce upload failure risk.
