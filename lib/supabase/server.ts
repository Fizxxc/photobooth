import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/env.client';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get(name) { return cookieStore.get(name)?.value; },
      set() {},
      remove() {}
    }
  });
}
