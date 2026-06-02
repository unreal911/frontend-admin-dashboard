import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

interface RouteContext {
  params: Promise<{ id: string }>;
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

export async function PATCH(_request: Request, context: RouteContext) {
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

  const upstream = await fetch(`${getAdminApiUrl()}/stores/${storeId}/deactivate`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo desactivar la tienda.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

