import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { clientEnv } from '@/lib/env.client';

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/booth/')) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request
  });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options
          });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
            maxAge: 0
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, trial_ends_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'admin') {
    return response;
  }

  const now = new Date();
  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;

  if (trialEndsAt && trialEndsAt > now) {
    return response;
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('subscription_end, status')
    .eq('user_id', user.id)
    .in('status', ['trial', 'active'])
    .order('subscription_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  const subscriptionEnd = subscription?.subscription_end
    ? new Date(subscription.subscription_end)
    : null;

  const hasAccess = Boolean(subscriptionEnd && subscriptionEnd > now);

  if (!hasAccess) {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/booth/:path*']
};