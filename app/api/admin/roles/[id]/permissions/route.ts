import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

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

async function withAuth(id: string) {
  const roleId = Number(id);
  if (!Number.isInteger(roleId) || roleId < 1) {
    return null;
  }

  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return null;
  }

  return { roleId, token, cookieStore };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await withAuth(id);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Solicitud invalida o sesion no valida.' }, { status: 400 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/roles/${auth.roleId}/permissions`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudieron cargar permisos del rol.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => ({ permissions: [] }));
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await withAuth(id);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Solicitud invalida o sesion no valida.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const permissions = (body as { permissions?: unknown } | null)?.permissions;
  if (!Array.isArray(permissions) || !permissions.every((item) => typeof item === 'string')) {
    return NextResponse.json({ success: false, message: 'permissions debe ser un arreglo de strings.' }, { status: 400 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/roles/${auth.roleId}/permissions`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ permissions }),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudieron guardar permisos del rol.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

