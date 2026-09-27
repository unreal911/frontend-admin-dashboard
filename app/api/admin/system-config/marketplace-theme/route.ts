import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';

async function proxy(method: 'GET' | 'PUT', body?: unknown) {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(COOKIE)?.value || '').trim();
  if (!token) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });

  const upstream = await fetch(`${getAdminApiUrl()}/system-config/marketplace-theme${method === 'PUT' ? '/draft' : ''}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudo conectar con la API.' }, { status: 502 });

  const refreshed = String(upstream.headers.get('x-access-token') || '').trim();
  if (refreshed) cookieStore.set(COOKIE, refreshed, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 });
  const payload = await upstream.json().catch(() => ({ message: 'Respuesta invalida de la API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET() {
  return proxy('GET');
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ message: 'Payload invalido.' }, { status: 400 });
  return proxy('PUT', body);
}
