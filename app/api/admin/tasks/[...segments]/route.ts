import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';

async function proxy(request: Request, method: 'GET' | 'POST' | 'PATCH', segments: string[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });
  const route = segments.filter(Boolean).map(encodeURIComponent).join('/');
  const incoming = new URL(request.url);
  const query = incoming.searchParams.toString();
  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (method !== 'GET') {
    body = await request.text().catch(() => '');
    if (body) headers['content-type'] = 'application/json';
  }
  const upstream = await fetch(`${getAdminApiUrl()}/tasks/${route}${query ? `?${query}` : ''}`, {
    method, headers, body, cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudo completar la accion sobre la tarea.' }, { status: 502 });
  const refreshed = upstream.headers.get('x-access-token');
  if (refreshed) cookieStore.set(COOKIE, refreshed, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 28_800 });
  return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
}

type Context = { params: Promise<{ segments: string[] }> };
export async function GET(request: Request, context: Context) { return proxy(request, 'GET', (await context.params).segments); }
export async function POST(request: Request, context: Context) { return proxy(request, 'POST', (await context.params).segments); }
export async function PATCH(request: Request, context: Context) { return proxy(request, 'PATCH', (await context.params).segments); }
