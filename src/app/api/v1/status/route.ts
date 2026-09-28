import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { API_VERSION } from '@/lib/api-global/formato';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/status — o endpoint de teste da API Global (v1.129.0).
 * Header: X-API-Key: <chave do sistema>. Sem chave válida → 401.
 */
export const GET = comApiKey(async () =>
  NextResponse.json({ status: 'ok', service: 'SGO', api_version: API_VERSION }),
);
