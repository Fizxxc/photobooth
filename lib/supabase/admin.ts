import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { clientEnv } from '@/lib/env.client';
import { requireServerEnv } from '@/lib/env.server';

export function createSupabaseAdminClient() {
  const serverEnv = requireServerEnv(['SUPABASE_SERVICE_ROLE_KEY']);
  return createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
