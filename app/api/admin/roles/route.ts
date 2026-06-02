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

async function withAuth(request: Request) {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return null;
  }

  return {
    token,
    cookieStore,
    url: new URL(request.url),
  };
}

export async function GET(request: Request) {
  const auth = await withAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const params = new URLSearchParams();
  const search = String(auth.url.searchParams.get('search') || '').trim();
  const isActive = String(auth.url.searchParams.get('isActive') || '').trim();

  if (search) {
    params.set('search', search);
  }
  if (isActive === 'true' || isActive === 'false') {
    params.set('isActive', isActive);
  }

  const query = params.toString();
  const path = query ? `/roles?${query}` : '/roles';
  const upstream = await fetch(`${getAdminApiUrl()}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudieron cargar roles.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => []);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(request: Request) {
  const auth = await withAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Payload invalido.' }, { status: 400 });
  }

  const name = String((body as { name?: unknown }).name || '').trim();
  const description = String((body as { description?: unknown }).description || '').trim();
  const isActiveRaw = (body as { isActive?: unknown }).isActive;
  const isActive = typeof isActiveRaw === 'boolean' ? isActiveRaw : true;

  if (!name) {
    return NextResponse.json({ success: false, message: 'El nombre del rol es obligatorio.' }, { status: 400 });
  }

  const payload: { name: string; description?: string; isActive: boolean } = {
    name,
    isActive,
  };
  if (description) {
    payload.description = description;
  }

  const upstream = await fetch(`${getAdminApiUrl()}/roles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo crear el rol.' }, { status: 502 });
  }

  const responsePayload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(responsePayload, { status: upstream.status });
}

