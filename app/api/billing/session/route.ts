import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createPakasirQrisTransaction } from '@/lib/billing/pakasir';
import { getServerEnv, requireServerEnv } from '@/lib/env.server';
import { SESSION_PRICE_IDR } from '@/lib/constants';

export async function POST(request: Request) {
  requireServerEnv(['SUPABASE_SERVICE_ROLE_KEY', 'PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const sessionId = String(body?.sessionId ?? '');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from('sessions')
    .select('id, user_id, gross_amount, platform_fee, status')
    .eq('id', sessionId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const existing = await admin
    .from('pakasir_orders')
    .select('order_id, amount, platform_fee, status, raw_payload')
    .eq('session_id', sessionId)
    .eq('user_id', auth.user.id)
    .eq('purpose', 'session')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const env = getServerEnv();

  if (existing.data && existing.data.status === 'pending') {
    const rawPayload = (existing.data.raw_payload ?? null) as { pakasir_payment?: Record<string, any> } | null;
    const payment = rawPayload?.pakasir_payment as any;
    if (payment?.payment_number) {
      return NextResponse.json({
        orderId: existing.data.order_id,
        amount: payment.total_payment,
        netAmount: existing.data.amount,
        fee: payment.fee,
        qrString: payment.payment_number,
        expiresAt: payment.expired_at,
        paymentMethod: payment.payment_method,
        provider: 'Pakasir QRIS',
        mode: env.PAKASIR_MODE
      });
    }
  }

  const amount = Number(session.gross_amount ?? SESSION_PRICE_IDR);
  const orderId = `KGS-SESSION-${sessionId.slice(0, 8).toUpperCase()}-${Date.now()}`;
  const pakasir = await createPakasirQrisTransaction({ orderId, amount });
  const payment = pakasir.payment;

  await admin.from('pakasir_orders').insert({
    user_id: auth.user.id,
    session_id: sessionId,
    order_id: orderId,
    purpose: 'session',
    amount,
    platform_fee: Number(session.platform_fee ?? env.PAKASIR_PLATFORM_FEE),
    status: 'pending',
    raw_payload: {
      product_name: 'KoGraph Studio Booth Session',
      pakasir_payment: payment
    }
  });

  return NextResponse.json({
    orderId,
    amount: payment.total_payment,
    netAmount: amount,
    fee: payment.fee,
    qrString: payment.payment_number,
    expiresAt: payment.expired_at,
    paymentMethod: payment.payment_method,
    provider: 'Pakasir QRIS',
    mode: env.PAKASIR_MODE
  });
}
