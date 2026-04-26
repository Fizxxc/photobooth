import { z } from 'zod';

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://kographbooth.vercel.app'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default('https://example.supabase.co'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default('demo-anon-key'),
  NEXT_PUBLIC_BOOTH_API_BASE_URL: z.string().url().default('https://kographbooth.vercel.app')
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'https://kographbooth.vercel.app',
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_BOOTH_API_BASE_URL:
    process.env.NEXT_PUBLIC_BOOTH_API_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://kographbooth.vercel.app'
});
