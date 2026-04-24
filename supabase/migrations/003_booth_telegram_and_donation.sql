begin;

-- allow donation order purpose
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'payment_purpose'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_purpose'
      AND e.enumlabel = 'donation'
  ) THEN
    ALTER TYPE public.payment_purpose ADD VALUE 'donation';
  END IF;
END $$;

-- sessions fields used by booth runtime, telegram claim, and final output delivery
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS session_code text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS final_bucket_id text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS final_storage_path text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS raw_frames text[] DEFAULT '{}'::text[];
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS total_amount bigint DEFAULT 10000;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS telegram_claim_chat_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_session_code_key'
  ) THEN
    ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_code_key UNIQUE (session_code);
  END IF;
END $$;

-- app settings compatibility for admin kill switch UI
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS singleton boolean DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS booth_kill_switch boolean DEFAULT false;

UPDATE public.app_settings
SET singleton = true,
    booth_kill_switch = COALESCE(booth_kill_switch, false)
WHERE singleton IS DISTINCT FROM true
   OR booth_kill_switch IS NULL;

INSERT INTO public.app_settings (key, value, singleton, booth_kill_switch)
SELECT 'platform', '{}'::jsonb, true, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings
);

commit;
