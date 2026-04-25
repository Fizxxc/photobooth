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
  purpose?: string | null;
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

  let order: PakasirOrderRow | null = null;

  {
    const { data, error } = await admin
      .from('pakasir_orders')
      .select('id, order_id, amount, purpose, kind, source, status, metadata')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    order = (data as PakasirOrderRow | null) ?? null;
  }

  let donationContribution: DonationContributionRow | null = null;

  if (!order && orderId.startsWith('KGS-SUPPORT-')) {
    const { data, error } = await admin
      .from('donation_contributions')
      .select('id, order_id, amount, telegram_chat_id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    donationContribution = (data as DonationContributionRow | null) ?? null;

    if (donationContribution) {
      const inserted = await admin
        .from('pakasir_orders')
        .insert({
          order_id: orderId,
          amount,
          purpose: 'donation',
          status: 'pending',
          kind: 'support_donation',
          source: 'telegram',
          metadata: {
            restored_from: 'donation_contributions',
            telegram_chat_id: donationContribution.telegram_chat_id ?? null
          }
        })
        .select('id, order_id, amount, purpose, kind, source, status, metadata')
        .maybeSingle();

      if (inserted.error) {
        return NextResponse.json({ error: inserted.error.message }, { status: 500 });
      }

      order = (inserted.data as PakasirOrderRow | null) ?? null;
    }
  }

  if (!order && orderId.startsWith('KGS-SUPPORT-')) {
    const inserted = await admin
      .from('pakasir_orders')
      .insert({
        order_id: orderId,
        amount,
        purpose: 'donation',
        status: 'pending',
        kind: 'support_donation',
        source: 'telegram',
        metadata: {
          restored_from: 'webhook_only',
          warning: 'Original donation row not found'
        }
      })
      .select('id, order_id, amount, purpose, kind, source, status, metadata')
      .maybeSingle();

    if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    order = (inserted.data as PakasirOrderRow | null) ?? null;
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (Number(order.amount) !== amount) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  let detail: any = null;

  try {
    detail = await getPakasirTransactionDetail(orderId, amount);
  } catch (error) {
    console.error('Pakasir verification failed:', error);
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (verifiedStatus === 'completed' || incomingStatus === 'completed') {
    try {
      if (order.kind === 'support_donation' || order.purpose === 'donation') {
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
      console.error('Finalize error:', error);
      return NextResponse.json({ error: 'Failed to finalize order' }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    orderId,
    purpose: order.purpose ?? null,
    kind: order.kind ?? null,
    status: verifiedStatus || incomingStatus || 'pending'
  });
}