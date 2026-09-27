import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';
type Context = { params: Promise<{ id: string }> };

async function proxy(request: Request, method: 'GET' | 'POST', id: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (method === 'POST') {
    body = await request.text().catch(() => '');
    headers['content-type'] = 'application/json';
  }
  const upstream = await fetch(`${getAdminApiUrl()}/users/${encodeURIComponent(id)}/store-assignments`, { method, headers, body, cache: 'no-store' }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudo completar la solicitud.' }, { status: 502 });
  const refreshed = upstream.headers.get('x-access-token');
  if (refreshed) cookieStore.set(COOKIE, refreshed, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 28_800 });
  return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
}

export async function GET(request: Request, context: Context) { return proxy(request, 'GET', (await context.params).id); }
export async function POST(request: Request, context: Context) { return proxy(request, 'POST', (await context.params).id); }
