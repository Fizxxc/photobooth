import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createPakasirQrisTransaction } from '@/lib/billing/pakasir';
import { getServerEnv, requireServerEnv } from '@/lib/env.server';

export async function POST(request: Request) {
  requireServerEnv(['SUPABASE_SERVICE_ROLE_KEY', 'PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const amount = Number(body?.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 1000) {
    return NextResponse.json({ error: 'Minimal donasi Rp 1.000' }, { status: 400 });
  }

  const orderId = `KGS-DON-${Date.now()}`;
  const pakasir = await createPakasirQrisTransaction({ orderId, amount });
  const admin = createSupabaseAdminClient();
  const env = getServerEnv();
  const payment = pakasir.payment;

  await admin.from('pakasir_orders').insert({
    user_id: auth.user.id,
    order_id: orderId,
    purpose: 'donation',
    amount,
    platform_fee: env.PAKASIR_PLATFORM_FEE,
    status: 'pending',
    raw_payload: {
      product_name: 'KoGraph Studio Donation',
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
