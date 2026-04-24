import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPakasirTransactionDetail } from '@/lib/billing/pakasir';
import { finalizeCompletedOrder } from '@/lib/billing/finalize';

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from('pakasir_orders').select('*').eq('order_id', orderId).eq('user_id', auth.user.id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const detail = await getPakasirTransactionDetail(order.order_id, order.amount);
  const tx = detail?.transaction;
  const status = String(tx?.status ?? order.status ?? 'pending');

  if (status === 'completed') {
    await finalizeCompletedOrder(order.order_id, tx?.completed_at);
  }

  await admin.from('pakasir_orders').update({ status, raw_payload: { ...(order.raw_payload ?? {}), detail } }).eq('id', order.id);
  return NextResponse.json({ status, transaction: tx ?? null });
}
