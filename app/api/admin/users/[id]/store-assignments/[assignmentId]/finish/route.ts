import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';
type Context = { params: Promise<{ id: string; assignmentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  const { id, assignmentId } = await context.params;
  const body = await request.text().catch(() => '');
  const upstream = await fetch(`${getAdminApiUrl()}/users/${encodeURIComponent(id)}/store-assignments/${encodeURIComponent(assignmentId)}/finish`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body, cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudo finalizar la asignación.' }, { status: 502 });
  const refreshed = upstream.headers.get('x-access-token');
  if (refreshed) cookieStore.set(COOKIE, refreshed, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 28_800 });
  return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
}
