import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ message: 'Id de cliente invalido.' }, { status: 400 });
  const cookieStore = await cookies();
  const session = String(cookieStore.get(COOKIE)?.value || '').trim();
  if (!session) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const upstream = await fetch(`${getAdminApiUrl()}/customers/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudo actualizar el cliente.' }, { status: 502 });
  const payload = await upstream.json().catch(() => null);
  const refreshed = String(upstream.headers.get('x-access-token') || '').trim();
  if (refreshed) cookieStore.set(COOKIE, refreshed, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8,
  });
  return NextResponse.json(payload, { status: upstream.status });
}
