import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function normalizeStoreType(value: unknown): 'STORE' | 'WAREHOUSE' | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'STORE' || normalized === 'WAREHOUSE') {
    return normalized;
  }
  return null;
}

function applyTokenRefresh(response: Response, cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const refreshedToken = String(response.headers.get('x-access-token') || '').trim();
  if (!refreshedToken) {
    return;
  }

  cookieStore.set(ADMIN_SESSION_COOKIE, refreshedToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const storeId = Number(id);
  if (!Number.isInteger(storeId) || storeId < 1) {
    return NextResponse.json({ success: false, message: 'Id de tienda invalido.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Payload invalido.' }, { status: 400 });
  }

  const name = String((body as { name?: unknown }).name || '').trim();
  const code = String((body as { code?: unknown }).code || '').trim();
  const type = normalizeStoreType((body as { type?: unknown }).type);
  const address = String((body as { address?: unknown }).address || '').trim();

  if (!name || !code || !type) {
    return NextResponse.json(
      { success: false, message: 'Nombre, codigo y tipo son obligatorios.' },
      { status: 400 },
    );
  }

  const payload: { name: string; code: string; type: 'STORE' | 'WAREHOUSE'; address?: string } = {
    name,
    code,
    type,
  };
  if (address) {
    payload.address = address;
  }

  const upstream = await fetch(`${getAdminApiUrl()}/stores/${storeId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo actualizar la tienda.' }, { status: 502 });
  }

  const responsePayload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, cookieStore);
  return NextResponse.json(responsePayload, { status: upstream.status });
}

