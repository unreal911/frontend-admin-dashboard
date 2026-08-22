import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';

async function token() {
  return String((await cookies()).get(COOKIE)?.value || '').trim();
}

async function proxy(upstream: Response | null, fallback: string) {
  if (!upstream) return NextResponse.json({ message: fallback }, { status: 502 });
  const payload = await upstream.json().catch(() => null);
  const refreshed = String(upstream.headers.get('x-access-token') || '').trim();
  if (refreshed) {
    (await cookies()).set(COOKIE, refreshed, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8,
    });
  }
  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET(request: Request) {
  const session = await token();
  if (!session) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  const source = new URL(request.url).searchParams;
  const params = new URLSearchParams({
    page: String(Math.max(1, Number(source.get('page')) || 1)),
    limit: String(Math.min(200, Math.max(1, Number(source.get('limit')) || 50))),
  });
  const search = String(source.get('search') || '').trim();
  const isActive = source.get('isActive');
  if (search) params.set('search', search);
  if (isActive === 'true' || isActive === 'false') params.set('isActive', isActive);
  const upstream = await fetch(`${getAdminApiUrl()}/customers?${params}`, {
    headers: { Authorization: `Bearer ${session}` }, cache: 'no-store',
  }).catch(() => null);
  return proxy(upstream, 'No se pudieron consultar los clientes.');
}

export async function POST(request: Request) {
  const session = await token();
  if (!session) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const upstream = await fetch(`${getAdminApiUrl()}/customers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  }).catch(() => null);
  return proxy(upstream, 'No se pudo registrar el cliente.');
}
