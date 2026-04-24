import 'server-only';
import { getServerEnv, requireServerEnv } from '@/lib/env.server';

export interface PakasirCreatePayload {
  orderId: string;
  amount: number;
}

export interface PakasirCreateResponse {
  payment: {
    project: string;
    order_id: string;
    amount: number;
    fee: number;
    total_payment: number;
    payment_method: string;
    payment_number: string;
    expired_at: string;
  };
}

function apiUrl(path: string) {
  const env = getServerEnv();
  return `${env.PAKASIR_BASE_URL}${path}`;
}

export async function createPakasirQrisTransaction(payload: PakasirCreatePayload) {
  const env = requireServerEnv(['PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);
  const response = await fetch(apiUrl('/api/transactioncreate/qris'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: env.PAKASIR_PROJECT_SLUG,
      order_id: payload.orderId,
      amount: payload.amount,
      api_key: env.PAKASIR_API_KEY
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Pakasir transaction create failed: ${response.status}`);
  return (await response.json()) as PakasirCreateResponse;
}

export async function getPakasirTransactionDetail(orderId: string, amount: number) {
  const env = requireServerEnv(['PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);
  const url = new URL(apiUrl('/api/transactiondetail'));
  url.searchParams.set('project', env.PAKASIR_PROJECT_SLUG!);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('order_id', orderId);
  url.searchParams.set('api_key', env.PAKASIR_API_KEY!);

  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error(`Pakasir detail failed: ${response.status}`);
  return await response.json();
}

export async function simulatePakasirPayment(orderId: string, amount: number) {
  const env = requireServerEnv(['PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);
  const response = await fetch(apiUrl('/api/paymentsimulation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: env.PAKASIR_PROJECT_SLUG,
      order_id: orderId,
      amount,
      api_key: env.PAKASIR_API_KEY
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Pakasir simulation failed: ${response.status}`);
  return await response.json();
}
