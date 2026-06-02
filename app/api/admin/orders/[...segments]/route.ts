import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

function applyTokenRefresh(response: Response, cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const refreshedToken = String(response.headers.get('x-access-token') || '').trim();
  if (!refreshedToken) {
    return;
  }

  cookieStore.set(ADMIN_SESSION_COOKIE, refreshedToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

async function withToken() {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return null;
  }
  return { token, cookieStore };
}

async function proxyOrderRoute(
  request: Request,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  segments: string[],
) {
  const auth = await withToken();
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const safeSegments = (segments || []).filter(Boolean).map((part) => encodeURIComponent(part));
  const routePath = safeSegments.join('/');
  const incomingUrl = new URL(request.url);
  const query = incomingUrl.searchParams.toString();
  const upstreamUrl = query
    ? `${getAdminApiUrl()}/orders/${routePath}?${query}`
    : `${getAdminApiUrl()}/orders/${routePath}`;

  const headers: HeadersInit = {
    Authorization: `Bearer ${auth.token}`,
  };

  let body: string | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    const rawBody = await request.text().catch(() => '');
    if (rawBody) {
      body = rawBody;
      headers['content-type'] = 'application/json';
    }
  }

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json(
      { success: false, message: 'No se pudo completar la solicitud de pedidos.' },
      { status: 502 },
    );
  }

  const payload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

type ParamsInput = Promise<{ segments: string[] }>;

export async function GET(request: Request, context: { params: ParamsInput }) {
  const { segments } = await context.params;
  return proxyOrderRoute(request, 'GET', segments);
}

export async function POST(request: Request, context: { params: ParamsInput }) {
  const { segments } = await context.params;
  return proxyOrderRoute(request, 'POST', segments);
}

export async function PATCH(request: Request, context: { params: ParamsInput }) {
  const { segments } = await context.params;
  return proxyOrderRoute(request, 'PATCH', segments);
}

export async function PUT(request: Request, context: { params: ParamsInput }) {
  const { segments } = await context.params;
  return proxyOrderRoute(request, 'PUT', segments);
}

export async function DELETE(request: Request, context: { params: ParamsInput }) {
  const { segments } = await context.params;
  return proxyOrderRoute(request, 'DELETE', segments);
}
