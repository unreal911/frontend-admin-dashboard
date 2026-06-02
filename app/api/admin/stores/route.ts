import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

function normalizePositiveInt(value: string | null, fallback: number): number {
  const numberValue = Number(value || fallback);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return fallback;
  }
  return numberValue;
}

function normalizeStoreTypeParam(value: string | null): 'STORE' | 'WAREHOUSE' | null {
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

async function withAuth(request: Request): Promise<{ token: string; url: URL; cookieStore: Awaited<ReturnType<typeof cookies>> } | NextResponse> {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  return {
    token,
    url: new URL(request.url),
    cookieStore,
  };
}

export async function GET(request: Request) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { token, url, cookieStore } = auth;
  const params = new URLSearchParams({
    skip: String(normalizePositiveInt(url.searchParams.get('skip'), 1)),
    take: String(normalizePositiveInt(url.searchParams.get('take'), 100)),
  });

  const search = String(url.searchParams.get('search') || '').trim();
  const type = normalizeStoreTypeParam(url.searchParams.get('type'));
  const includeInactive = String(url.searchParams.get('includeInactive') || '').trim();

  if (search) {
    params.set('search', search);
  }
  if (type) {
    params.set('type', type);
  }
  if (includeInactive === 'true' || includeInactive === 'false') {
    params.set('includeInactive', includeInactive);
  }

  const upstream = await fetch(`${getAdminApiUrl()}/stores?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudieron cargar las tiendas.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => []);
  applyTokenRefresh(upstream, cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(request: Request) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { token, cookieStore } = auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Payload invalido.' }, { status: 400 });
  }

  const name = String((body as { name?: unknown }).name || '').trim();
  const code = String((body as { code?: unknown }).code || '').trim();
  const type = normalizeStoreTypeParam(String((body as { type?: unknown }).type || 'STORE'));
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

  const upstream = await fetch(`${getAdminApiUrl()}/stores`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo crear la tienda.' }, { status: 502 });
  }

  const responsePayload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, cookieStore);
  return NextResponse.json(responsePayload, { status: upstream.status });
}

