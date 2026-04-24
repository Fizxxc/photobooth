import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { simulatePakasirPayment } from '@/lib/billing/pakasir';
import { getServerEnv } from '@/lib/env.server';

export async function POST(request: Request) {
  const env = getServerEnv();
  if (env.PAKASIR_MODE !== 'sandbox') {
    return NextResponse.json({ error: 'Simulation only available in sandbox mode' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const orderId = String(body?.orderId ?? '');
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from('pakasir_orders').select('*').eq('order_id', orderId).eq('user_id', auth.user.id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const result = await simulatePakasirPayment(orderId, order.amount);
  return NextResponse.json({ ok: true, result });
}
