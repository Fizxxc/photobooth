import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type PakasirOrderRow = {
  id: string;
  user_id?: string | null;
  session_id?: string | null;
  order_id: string;
  amount: number;
  platform_fee?: number | null;
  status?: string | null;
  purpose?: string | null;
  kind?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  raw_payload?: Record<string, unknown> | null;
};

type WalletRow = {
  id: string;
  user_id: string;
  balance: number;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  subscription_start: string;
  subscription_end: string;
  status: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getEffectiveKind(order: PakasirOrderRow) {
  return String(order.kind ?? order.purpose ?? '').trim().toLowerCase();
}

function toIso(value?: string | null) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function maxIso(a: string, b: string) {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

async function creditWallet(userId: string, amount: number) {
  if (amount <= 0) return;

  const admin = createSupabaseAdminClient();

  const { data: wallet, error: walletError } = await admin
    .from('wallets')
    .select('id, user_id, balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError) {
    throw walletError;
  }

  if (!wallet) {
    const { error: insertError } = await admin.from('wallets').insert({
      user_id: userId,
      balance: amount
    });

    if (insertError) {
      throw insertError;
    }

    return;
  }

  const nextBalance = Number(wallet.balance || 0) + amount;

  const { error: updateError } = await admin
    .from('wallets')
    .update({ balance: nextBalance })
    .eq('id', wallet.id);

  if (updateError) {
    throw updateError;
  }
}

async function finalizeSessionOrder(order: PakasirOrderRow, completedAt: string) {
  const admin = createSupabaseAdminClient();

  if (!order.session_id) {
    throw new Error('Session order is missing session_id');
  }

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, user_id, status, net_amount')
    .eq('id', order.session_id)
    .maybeSingle();

  if (sessionError) {
    throw sessionError;
  }

  if (!session) {
    throw new Error('Session not found');
  }

  const { error: updateSessionError } = await admin
    .from('sessions')
    .update({
      status: 'completed'
    })
    .eq('id', session.id);

  if (updateSessionError) {
    throw updateSessionError;
  }

  if (session.user_id) {
    await creditWallet(session.user_id, Number(session.net_amount || 0));
  }
}

async function finalizeSubscriptionOrder(order: PakasirOrderRow, completedAt: string) {
  const admin = createSupabaseAdminClient();

  if (!order.user_id) {
    throw new Error('Subscription order is missing user_id');
  }

  const metadata = {
    ...asObject(order.raw_payload),
    ...asObject(order.metadata)
  };

  const requestedDays = Number(
    metadata.subscription_days ??
      metadata.duration_days ??
      metadata.days ??
      30
  );

  const subscriptionDays =
    Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : 30;

  const planCode = String(metadata.plan_code ?? metadata.plan ?? 'pro');

  const { data: latestSubscription, error: latestSubscriptionError } = await admin
    .from('subscriptions')
    .select('id, user_id, subscription_start, subscription_end, status')
    .eq('user_id', order.user_id)
    .in('status', ['trial', 'active'])
    .order('subscription_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestSubscriptionError) {
    throw latestSubscriptionError;
  }

  const nowIso = completedAt;
  const latestEnd = latestSubscription?.subscription_end
    ? new Date(latestSubscription.subscription_end).toISOString()
    : null;

  const startIso = latestEnd ? maxIso(nowIso, latestEnd) : nowIso;
  const endIso = addDays(startIso, subscriptionDays);

  const { error: insertSubscriptionError } = await admin.from('subscriptions').insert({
    user_id: order.user_id,
    plan_code: planCode,
    subscription_start: startIso,
    subscription_end: endIso,
    status: 'active'
  });

  if (insertSubscriptionError) {
    throw insertSubscriptionError;
  }
}

export async function finalizeCompletedOrder(orderId: string, completedAt?: string | null) {
  const admin = createSupabaseAdminClient();

  const { data: order, error: orderError } = await admin
    .from('pakasir_orders')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (orderError) {
    throw orderError;
  }

  if (!order) {
    throw new Error('Pakasir order not found');
  }

  const typedOrder = order as PakasirOrderRow;
  const metadata = {
    ...asObject(typedOrder.raw_payload),
    ...asObject(typedOrder.metadata)
  };

  if (metadata.finalized_at) {
    return;
  }

  const effectiveKind = getEffectiveKind(typedOrder);
  const finalizedAt = toIso(completedAt);

  if (effectiveKind === 'session') {
    await finalizeSessionOrder(typedOrder, finalizedAt);
  } else if (
    effectiveKind === 'subscription' ||
    effectiveKind === 'subscribe' ||
    effectiveKind === 'membership'
  ) {
    await finalizeSubscriptionOrder(typedOrder, finalizedAt);
  } else if (effectiveKind === 'support_donation' || effectiveKind === 'donation') {
    // handled elsewhere by finalizeDonationOrder
  } else {
    // fallback legacy behavior:
    // kalau order punya session_id, anggap session
    if (typedOrder.session_id) {
      await finalizeSessionOrder(typedOrder, finalizedAt);
    } else if (typedOrder.user_id) {
      await finalizeSubscriptionOrder(typedOrder, finalizedAt);
    }
  }

  const { error: updateOrderError } = await admin
    .from('pakasir_orders')
    .update({
      status: 'completed',
      metadata: {
        ...metadata,
        finalized_at: finalizedAt,
        finalized_kind: effectiveKind || null
      }
    })
    .eq('id', typedOrder.id);

  if (updateOrderError) {
    throw updateOrderError;
  }
}