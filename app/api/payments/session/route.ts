import { NextRequest, NextResponse } from 'next/server';
import { createPakasirQrisTransaction } from '@/lib/billing/pakasir';
import { SESSION_PRICE_IDR } from '@/lib/constants';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = String(body.sessionId ?? '');

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, session_code')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const orderId = `SESSION-${session.id}-${Date.now()}`;

  const billing = await createPakasirQrisTransaction({
    orderId,
    amount: SESSION_PRICE_IDR
  });

  const { error: insertError } = await supabase.from('pakasir_orders').insert({
    user_id: user.id,
    session_id: session.id,
    order_id: orderId,
    purpose: 'session',
    amount: SESSION_PRICE_IDR,
    platform_fee: 1000,
    status: 'pending'
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(billing);
}