import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

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

async function withToken() {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return null;
  }
  return { token, cookieStore };
}

export async function GET() {
  const auth = await withToken();
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/inventory/transfers`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudieron cargar transferencias.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => []);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(request: Request) {
  const auth = await withToken();
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Payload invalido.' }, { status: 400 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/inventory/transfers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo crear transferencia.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

