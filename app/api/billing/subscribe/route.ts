import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createPakasirQrisTransaction } from '@/lib/billing/pakasir';
import { getServerEnv, requireServerEnv } from '@/lib/env.server';

const planMap: Record<string, { amount: number; productName: string; durationDays: number }> = {
  pro_monthly: { amount: 149000, productName: 'KoGraph Studio Professional Monthly', durationDays: 30 },
  session_fee: { amount: 10000, productName: 'KoGraph Studio Session Fee', durationDays: 0 }
};

export async function POST(request: Request) {
  requireServerEnv(['SUPABASE_SERVICE_ROLE_KEY', 'PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const planCode = String(body?.planCode ?? '');
  const selectedPlan = planMap[planCode];
  if (!selectedPlan) return NextResponse.json({ error: 'Invalid plan code' }, { status: 400 });

  const orderId = `KGS-${planCode.toUpperCase()}-${Date.now()}`;
  const pakasir = await createPakasirQrisTransaction({ orderId, amount: selectedPlan.amount });
  const admin = createSupabaseAdminClient();
  const env = getServerEnv();
  const payment = pakasir.payment;

  await admin.from('pakasir_orders').insert({
    user_id: auth.user.id,
    order_id: orderId,
    purpose: planCode === 'session_fee' ? 'session' : 'subscription',
    amount: selectedPlan.amount,
    platform_fee: env.PAKASIR_PLATFORM_FEE,
    status: 'pending',
    raw_payload: {
      plan_code: planCode,
      duration_days: selectedPlan.durationDays,
      pakasir_payment: payment,
      product_name: selectedPlan.productName
    }
  });

  return NextResponse.json({
    orderId,
    amount: payment.total_payment,
    netAmount: selectedPlan.amount,
    fee: payment.fee,
    qrString: payment.payment_number,
    expiresAt: payment.expired_at,
    paymentMethod: payment.payment_method,
    provider: 'Pakasir QRIS',
    mode: env.PAKASIR_MODE
  });
}
