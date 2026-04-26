import { z } from 'zod';

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().default('https://example.supabase.co'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default('demo-anon-key')
});

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
});
