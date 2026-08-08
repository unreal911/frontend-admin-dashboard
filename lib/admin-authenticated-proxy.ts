import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

export async function proxyAuthenticatedAdminRequest(
  backendPath: string,
  init: { method?: string; body?: unknown; responseType?: 'json' | 'binary' } = {},
) {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}${backendPath}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) {
    return NextResponse.json({ message: 'No se pudo conectar con el backend.' }, { status: 502 });
  }

  const refreshedToken = String(upstream.headers.get('x-access-token') || '').trim();
  if (refreshedToken) {
    cookieStore.set(ADMIN_SESSION_COOKIE, refreshedToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
  }
  if (upstream.status === 401) {
    cookieStore.delete(ADMIN_SESSION_COOKIE);
  }
  if (init.responseType === 'binary' && upstream.ok) {
    const headers = new Headers();
    for (const name of ['content-type', 'content-disposition', 'x-export-sha256', 'x-export-rows']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }
  const payload = await upstream.json().catch(() => null);
  return NextResponse.json(payload, { status: upstream.status });
}
