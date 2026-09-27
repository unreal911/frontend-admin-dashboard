import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const COOKIE = 'admin_session';

async function forward(request: Request, segments: string[]) {
  const jar = await cookies();
  const session = String(jar.get(COOKIE)?.value || '').trim();
  if (!session) return NextResponse.json({ message: 'Sesión no válida.' }, { status: 401 });
  const source = new URL(request.url);
  const path = segments.map(encodeURIComponent).join('/');
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
  const upstream = await fetch(`${getAdminApiUrl()}/attention/${path}${source.search}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${session}`,
      ...(body ? { 'content-type': request.headers.get('content-type') || 'application/json' } : {}),
    },
    body,
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudo conectar con atención.' }, { status: 502 });
  const payload = await upstream.json().catch(() => null);
  const refreshed = String(upstream.headers.get('x-access-token') || '').trim();
  if (refreshed) jar.set(COOKIE, refreshed, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8,
  });
  return NextResponse.json(payload, { status: upstream.status });
}

type Context = { params: Promise<{ segments: string[] }> };
export async function GET(request: Request, context: Context) { return forward(request, (await context.params).segments); }
export async function POST(request: Request, context: Context) { return forward(request, (await context.params).segments); }
export async function PATCH(request: Request, context: Context) { return forward(request, (await context.params).segments); }
