import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

interface RouteContext { params: Promise<{ id: string }>; }

export async function PATCH(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId) || transferId < 1) {
    return NextResponse.json({ success: false, message: 'Id de transferencia invalido.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/inventory/transfers/${transferId}/dispatch`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo despachar transferencia.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  const refreshedToken = String(upstream.headers.get('x-access-token') || '').trim();
  if (refreshedToken) {
    cookieStore.set(ADMIN_SESSION_COOKIE, refreshedToken, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8,
    });
  }
  return NextResponse.json(payload, { status: upstream.status });
}
