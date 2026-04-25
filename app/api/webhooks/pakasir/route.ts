import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPakasirTransactionDetail } from '@/lib/billing/pakasir';
import { finalizeCompletedOrder } from '@/lib/billing/finalize';
import { finalizeDonationOrder } from '@/lib/donation/service';

export async function POST(request: NextRequest) {
  const payload = await request.json();

  const orderId = String(payload?.order_id ?? '');
  const amount = Number(payload?.amount ?? 0);
  const status = String(payload?.status ?? '').toLowerCase();

  if (!orderId || !amount) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  let { data: order, error: orderError } = await admin
    .from('pakasir_orders')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // fallback khusus donation telegram
  if (!order && orderId.startsWith('KGS-SUPPORT-')) {
    const { data: donation } = await admin
      .from('donation_contributions')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (donation) {
      const inserted = await admin
        .from('pakasir_orders')
        .insert({
          order_id: orderId,
          amount,
          status: 'pending',
          kind: 'support_donation',
          source: 'telegram',
          metadata: {
            restored_from: 'donation_contributions',
            telegram_chat_id: donation.telegram_chat_id
          }
        })
        .select('*')
        .maybeSingle();

      order = inserted.data ?? null;
    }
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (Number(order.amount) !== amount) {
    return NextResponse.json(
      { error: 'Amount mismatch' },
      { status: 400 }
    );
  }

  // verifikasi ke Pakasir
  let detail: any = null;
  try {
    detail = await getPakasirTransactionDetail(orderId, amount);
  } catch {
    detail = null;
  }

  const verifiedStatus =
    String(
      detail?.transaction?.status ??
      detail?.status ??
      status
    ).toLowerCase();

  const completedAt =
    detail?.transaction?.completed_at ??
    detail?.completed_at ??
    payload?.completed_at ??
    null;

  await admin
    .from('pakasir_orders')
    .update({
      status: verifiedStatus || status || 'pending',
      metadata: {
        ...(order.metadata ?? {}),
        webhook: payload,
        verification: detail
      }
    })
    .eq('id', order.id);

  if (verifiedStatus === 'completed' || status === 'completed') {
    if (order.kind === 'support_donation') {
      await finalizeDonationOrder({
        orderId,
        amount,
        completedAt,
        payload
      });
    } else {
      await finalizeCompletedOrder(orderId, completedAt);
    }
  }

  return NextResponse.json({ ok: true });
}