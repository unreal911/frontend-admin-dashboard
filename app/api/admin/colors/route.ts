import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHex(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  const withHash = text.startsWith('#') ? text : `#${text}`;
  return HEX_COLOR_PATTERN.test(withHash) ? withHash.toUpperCase() : '';
}

function readBooleanParam(value: string | null): string | null {
  if (value === 'true' || value === 'false') {
    return value;
  }
  return null;
}

async function withAuthCookie(request: Request): Promise<{ token: string; url: URL } | NextResponse> {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }
  return { token, url: new URL(request.url) };
}

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

export async function GET(request: Request) {
  const auth = await withAuthCookie(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { token, url } = auth;
  const skip = Number(url.searchParams.get('skip') || 1);
  const take = Number(url.searchParams.get('take') || 100);
  const isActive = readBooleanParam(url.searchParams.get('isActive'));

  const params = new URLSearchParams({
    skip: String(Number.isFinite(skip) && skip > 0 ? skip : 1),
    take: String(Number.isFinite(take) && take > 0 ? take : 100),
  });

  if (isActive !== null) {
    params.set('isActive', isActive);
  }

  const upstream = await fetch(`${getAdminApiUrl()}/color?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudieron consultar colores.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => ({ data: [] }));
  const cookieStore = await cookies();
  applyTokenRefresh(upstream, cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(request: Request) {
  const auth = await withAuthCookie(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { token } = auth;
  const body = await request.json().catch(() => null);
  const name = String(body?.name || '').trim();
  const hex = normalizeHex(body?.hex);

  if (!name) {
    return NextResponse.json({ success: false, message: 'El nombre es obligatorio.' }, { status: 400 });
  }
  if (hex === '') {
    return NextResponse.json({ success: false, message: 'El hexadecimal debe tener formato #RGB o #RRGGBB.' }, { status: 400 });
  }

  const payload: Record<string, unknown> = { name };
  if (hex) {
    payload.hex = hex;
  }

  const upstream = await fetch(`${getAdminApiUrl()}/color`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo crear el color.' }, { status: 502 });
  }

  const responsePayload = await upstream.json().catch(() => null);
  const cookieStore = await cookies();
  applyTokenRefresh(upstream, cookieStore);
  return NextResponse.json(responsePayload, { status: upstream.status });
}
