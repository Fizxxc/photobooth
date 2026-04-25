import 'server-only';

import { getServerEnv, requireServerEnv } from '@/lib/env.server';

export type PakasirCreatePayload = {
  orderId: string;
  amount: number;
  customerName?: string;
  notes?: string;
};

export type PakasirPaymentObject = {
  project: string;
  order_id: string;
  amount: number;
  fee: number;
  total_payment: number;
  payment_method: string;
  payment_number: string;
  expired_at: string;
  received?: number;
};

export type PakasirCreateResponse = {
  payment: PakasirPaymentObject;
};

export type PakasirDetailResponse = {
  transaction?: {
    project?: string;
    order_id?: string;
    amount?: number;
    fee?: number;
    total_payment?: number;
    payment_method?: string;
    payment_number?: string;
    expired_at?: string;
    completed_at?: string;
    status?: string;
    received?: number;
  };
  status?: string;
  completed_at?: string;
};

function getBaseUrl() {
  const env = getServerEnv();
  return (env.PAKASIR_BASE_URL || 'https://app.pakasir.com').replace(/\/+$/, '');
}

function apiUrl(path: string) {
  const base = getBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

function ensurePositiveAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid Pakasir amount');
  }
}

export async function createPakasirQrisTransaction(
  payload: PakasirCreatePayload
): Promise<PakasirCreateResponse> {
  const env = requireServerEnv(['PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);

  ensurePositiveAmount(payload.amount);

  const response = await fetch(apiUrl('/api/transactioncreate/qris'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      project: env.PAKASIR_PROJECT_SLUG,
      order_id: payload.orderId,
      amount: payload.amount,
      customer_name: payload.customerName ?? 'KoGraph Studio User',
      notes: payload.notes ?? '',
      api_key: env.PAKASIR_API_KEY
    }),
    cache: 'no-store'
  });

  const text = await response.text();

  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!response.ok) {
    throw new Error(
      `Pakasir transaction create failed (${response.status}): ${
        typeof json === 'string' ? json : JSON.stringify(json)
      }`
    );
  }

  return json as PakasirCreateResponse;
}

export async function getPakasirTransactionDetail(
  orderId: string,
  amount: number
): Promise<PakasirDetailResponse> {
  const env = requireServerEnv(['PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);

  ensurePositiveAmount(amount);

  const url = new URL(apiUrl('/api/transactiondetail'));
  url.searchParams.set('project', env.PAKASIR_PROJECT_SLUG!);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('order_id', orderId);
  url.searchParams.set('api_key', env.PAKASIR_API_KEY!);

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store'
  });

  const text = await response.text();

  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!response.ok) {
    throw new Error(
      `Pakasir detail failed (${response.status}): ${
        typeof json === 'string' ? json : JSON.stringify(json)
      }`
    );
  }

  return json as PakasirDetailResponse;
}

export async function simulatePakasirPayment(orderId: string, amount: number) {
  const env = requireServerEnv(['PAKASIR_PROJECT_SLUG', 'PAKASIR_API_KEY']);

  ensurePositiveAmount(amount);

  const response = await fetch(apiUrl('/api/paymentsimulation'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      project: env.PAKASIR_PROJECT_SLUG,
      order_id: orderId,
      amount,
      api_key: env.PAKASIR_API_KEY
    }),
    cache: 'no-store'
  });

  const text = await response.text();

  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!response.ok) {
    throw new Error(
      `Pakasir simulation failed (${response.status}): ${
        typeof json === 'string' ? json : JSON.stringify(json)
      }`
    );
  }

  return json;
}