import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/env.client';

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/booth/')) return NextResponse.next();

  const response = NextResponse.next({ request });
  const supabase = createServerClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get(name) { return request.cookies.get(name)?.value; },
      set(name, value, options) { response.cookies.set({ name, value, ...options }); },
      remove(name, options) { response.cookies.set({ name, value: '', ...options, maxAge: 0 }); }
    }
  });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/auth/login', request.url));

  const boothId = request.nextUrl.pathname.split('/')[2];
  const { data } = await supabase.rpc('check_booth_access', { input_booth_id: boothId });
  const access = Array.isArray(data) ? data[0] : data;
  if (!access?.allowed) return NextResponse.redirect(new URL('/pricing', request.url));
  return response;
}

export const config = { matcher: ['/booth/:path*'] };
