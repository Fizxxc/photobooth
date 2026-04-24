import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPakasirTransactionDetail } from '@/lib/billing/pakasir';
import { finalizeCompletedOrder } from '@/lib/billing/finalize';
import { requireServerEnv } from '@/lib/env.server';

export async function POST(request: NextRequest) {
  requireServerEnv(['SUPABASE_SERVICE_ROLE_KEY', 'PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);
  const payload = await request.json();
  const orderId = String(payload?.order_id ?? '');
  const amount = Number(payload?.amount ?? 0);
  const status = String(payload?.status ?? '');
  if (!orderId || !amount || !status) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from('pakasir_orders').select('*').eq('order_id', orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (Number(order.amount) !== amount) return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });

  const detail = await getPakasirTransactionDetail(orderId, amount);
  const tx = detail?.transaction;
  if (!tx || tx.order_id !== orderId || Number(tx.amount) !== amount) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  await admin.from('pakasir_orders').update({ status: tx.status, raw_payload: { webhook: payload, detail } }).eq('id', order.id);
  if (tx.status === 'completed') {
    await finalizeCompletedOrder(orderId, tx.completed_at);
  }

  return NextResponse.json({ ok: true });
}
