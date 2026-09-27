import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  const incoming = new URL(request.url);
  const upstream = await fetch(`${getAdminApiUrl()}/tasks?${incoming.searchParams.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudieron cargar las tareas.' }, { status: 502 });
  const refreshed = upstream.headers.get('x-access-token');
  if (refreshed) cookieStore.set(COOKIE, refreshed, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 28_800 });
  return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
}
