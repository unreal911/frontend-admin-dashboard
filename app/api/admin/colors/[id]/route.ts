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

interface RouteContext {
  params: Promise<{ id: string }>;
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

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const colorId = Number(id);
  if (!Number.isInteger(colorId) || colorId < 1) {
    return NextResponse.json({ success: false, message: 'Id de color invalido.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const payload: Record<string, unknown> = {};

  if (typeof body?.name === 'string') {
    const normalized = body.name.trim();
    if (normalized) {
      payload.name = normalized;
    }
  }

  if (typeof body?.isActive === 'boolean') {
    payload.isActive = body.isActive;
  }

  if (typeof body?.hex === 'string') {
    const normalizedHex = normalizeHex(body.hex);
    if (normalizedHex === '') {
      return NextResponse.json({ success: false, message: 'El hexadecimal debe tener formato #RGB o #RRGGBB.' }, { status: 400 });
    }
    payload.hex = normalizedHex;
  } else if (body?.hex === null) {
    payload.hex = null;
  }

  if (!Object.keys(payload).length) {
    return NextResponse.json({ success: false, message: 'No hay campos para actualizar.' }, { status: 400 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/color/${colorId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo actualizar el color.' }, { status: 502 });
  }

  const responsePayload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, cookieStore);
  return NextResponse.json(responsePayload, { status: upstream.status });
}
