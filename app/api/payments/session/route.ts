import { NextRequest, NextResponse } from 'next/server';
import { createPakasirBilling } from '@/lib/billing/pakasir';
import { SESSION_PRICE_IDR } from '@/lib/constants';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = String(body.sessionId ?? '');
  const { data: session } = await supabase
    .from('sessions')
    .select('id, session_code')
    .eq('id', sessionId)
    .eq('user_id', auth.user.id)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const orderId = `SESS-${session.session_code}`;
  const billing = await createPakasirBilling({
    orderId,
    amount: SESSION_PRICE_IDR,
    productName: 'KoGraph Photo Session',
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    notes: session.session_code
  });

  await supabase.from('pakasir_orders').insert({
    user_id: auth.user.id,
    session_id: session.id,
    order_id: orderId,
    purpose: 'session',
    amount: SESSION_PRICE_IDR,
    platform_fee: 1000,
    status: 'pending'
  });

  return NextResponse.json(billing);
}
