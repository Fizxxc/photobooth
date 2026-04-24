import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function finalizeCompletedOrder(orderId: string, completedAt?: string) {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from('pakasir_orders').select('*').eq('order_id', orderId).maybeSingle();
  if (!order || order.status === 'completed') return order;

  await admin
    .from('pakasir_orders')
    .update({ status: 'completed', raw_payload: { ...(order.raw_payload ?? {}), completed_at: completedAt ?? new Date().toISOString() } })
    .eq('id', order.id);

  if (order.purpose === 'session' && order.session_id) {
    await admin.rpc('settle_paid_session', { input_session_id: order.session_id });
    return order;
  }

  if (order.purpose === 'subscription') {
    const durationDays = Number(order.raw_payload?.duration_days ?? 30);
    const planCode = String(order.raw_payload?.plan_code ?? 'pro_monthly');
    const { data: existing } = await admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', order.user_id)
      .in('status', ['trial', 'active'])
      .order('subscription_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    const startsAt = existing?.subscription_end && new Date(existing.subscription_end) > new Date() ? existing.subscription_end : new Date().toISOString();
    const endDate = new Date(startsAt);
    endDate.setUTCDate(endDate.getUTCDate() + durationDays);

    if (existing) {
      await admin
        .from('subscriptions')
        .update({
          plan_code: planCode,
          status: 'active',
          started_at: existing.started_at,
          subscription_end: endDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await admin.from('subscriptions').insert({
        user_id: order.user_id,
        plan_code: planCode,
        started_at: new Date().toISOString(),
        subscription_end: endDate.toISOString(),
        status: 'active'
      });
    }

    await admin.from('profiles').update({ ads_last_shown_at: completedAt ?? new Date().toISOString() }).eq('id', order.user_id);
  }

  return order;
}
