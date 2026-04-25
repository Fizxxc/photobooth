import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPakasirTransactionDetail } from '@/lib/billing/pakasir';
import { finalizeCompletedOrder } from '@/lib/billing/finalize';
import { finalizeDonationOrder } from '@/lib/donation/service';
import { requireServerEnv } from '@/lib/env.server';

type PakasirWebhookPayload = {
  amount?: number | string;
  order_id?: string;
  project?: string;
  status?: string;
  payment_method?: string;
  completed_at?: string;
  is_sandbox?: boolean;
};

type PakasirOrderRow = {
  id: string;
  order_id: string;
  amount: number;
  kind?: string | null;
  source?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type DonationContributionRow = {
  id: string;
  order_id: string;
  amount: number;
  telegram_chat_id?: string | null;
};

function normalizeAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  requireServerEnv([
    'SUPABASE_SERVICE_ROLE_KEY',
    'PAKASIR_PROJECT_SLUG',
    'PAKASIR_API_KEY'
  ]);

  let payload: PakasirWebhookPayload;

  try {
    payload = (await request.json()) as PakasirWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const orderId = String(payload?.order_id ?? '').trim();
  const amount = normalizeAmount(payload?.amount);
  const incomingStatus = normalizeStatus(payload?.status);

  if (!orderId || !amount) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  console.log('PAKASIR_WEBHOOK_RECEIVED', {
    orderId,
    amount,
    status: incomingStatus,
    project: payload?.project,
    payment_method: payload?.payment_method,
    completed_at: payload?.completed_at,
    is_sandbox: payload?.is_sandbox
  });

  /**
   * 1) Cari order utama di pakasir_orders
   */
  let order: PakasirOrderRow | null = null;

  {
    const { data, error } = await admin
      .from('pakasir_orders')
      .select('id, order_id, amount, kind, source, status, metadata')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      console.error('PAKASIR_WEBHOOK_ORDER_LOOKUP_ERROR', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    order = (data as PakasirOrderRow | null) ?? null;
  }

  /**
   * 2) Recovery path untuk support donation Telegram
   *    Kalau belum ada di pakasir_orders, cari di donation_contributions
   */
  let donationContribution: DonationContributionRow | null = null;

  if (!order && orderId.startsWith('KGS-SUPPORT-')) {
    const { data, error } = await admin
      .from('donation_contributions')
      .select('id, order_id, amount, telegram_chat_id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      console.error('PAKASIR_WEBHOOK_DONATION_LOOKUP_ERROR', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    donationContribution = (data as DonationContributionRow | null) ?? null;

    console.log('PAKASIR_WEBHOOK_DONATION_FOUND', {
      found: Boolean(donationContribution),
      orderId
    });

    if (donationContribution) {
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
            telegram_chat_id: donationContribution.telegram_chat_id ?? null
          }
        })
        .select('id, order_id, amount, kind, source, status, metadata')
        .maybeSingle();

      if (inserted.error) {
        console.error('PAKASIR_WEBHOOK_RECOVERY_INSERT_ERROR', inserted.error);
        return NextResponse.json({ error: inserted.error.message }, { status: 500 });
      }

      order = (inserted.data as PakasirOrderRow | null) ?? null;
    }
  }

  /**
   * 3) Last-resort recovery:
   *    Untuk support donation yang entah kenapa tidak tercatat sama sekali,
   *    tetap buat placeholder agar webhook tidak 404 terus.
   */
  if (!order && orderId.startsWith('KGS-SUPPORT-')) {
    const inserted = await admin
      .from('pakasir_orders')
      .insert({
        order_id: orderId,
        amount,
        status: 'pending',
        kind: 'support_donation',
        source: 'telegram',
        metadata: {
          restored_from: 'webhook_only',
          warning: 'Original donation row not found'
        }
      })
      .select('id, order_id, amount, kind, source, status, metadata')
      .maybeSingle();

    if (inserted.error) {
      console.error('PAKASIR_WEBHOOK_PLACEHOLDER_INSERT_ERROR', inserted.error);
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    order = (inserted.data as PakasirOrderRow | null) ?? null;
  }

  /**
   * 4) Kalau masih tidak ada, memang order tidak ditemukan
   */
  if (!order) {
    console.warn('PAKASIR_WEBHOOK_ORDER_NOT_FOUND', { orderId, amount });
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  /**
   * 5) Validasi amount lokal
   */
  if (Number(order.amount) !== amount) {
    console.warn('PAKASIR_WEBHOOK_AMOUNT_MISMATCH', {
      orderId,
      expected: Number(order.amount),
      received: amount
    });

    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  /**
   * 6) Verifikasi ke Pakasir Transaction Detail API
   */
  let detail: any = null;

  try {
    detail = await getPakasirTransactionDetail(orderId, amount);
  } catch (error) {
    console.error('PAKASIR_WEBHOOK_DETAIL_VERIFICATION_FAILED', error);
  }

  const verifiedStatus = normalizeStatus(
    detail?.transaction?.status ??
      detail?.status ??
      incomingStatus
  );

  const completedAt =
    detail?.transaction?.completed_at ??
    detail?.completed_at ??
    payload?.completed_at ??
    null;

  /**
   * 7) Simpan hasil webhook + verification
   */
  const mergedMetadata = {
    ...(order.metadata ?? {}),
    webhook: payload,
    verification: detail
  };

  {
    const { error } = await admin
      .from('pakasir_orders')
      .update({
        status: verifiedStatus || incomingStatus || 'pending',
        metadata: mergedMetadata
      })
      .eq('id', order.id);

    if (error) {
      console.error('PAKASIR_WEBHOOK_UPDATE_ORDER_ERROR', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  /**
   * 8) Finalize order bila completed
   */
  if (verifiedStatus === 'completed' || incomingStatus === 'completed') {
    try {
      if (order.kind === 'support_donation') {
        await finalizeDonationOrder({
          orderId,
          amount,
          completedAt,
          payload: payload as Record<string, unknown>
        });
      } else {
        await finalizeCompletedOrder(orderId, completedAt);
      }
    } catch (error) {
      console.error('PAKASIR_WEBHOOK_FINALIZE_ERROR', {
        orderId,
        kind: order.kind,
        error
      });

      return NextResponse.json(
        { error: 'Failed to finalize order' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    orderId,
    kind: order.kind ?? null,
    status: verifiedStatus || incomingStatus || 'pending'
  });
}