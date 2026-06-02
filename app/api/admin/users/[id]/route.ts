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
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId < 1) {
    return null;
  }

  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return null;
  }

  return { userId, token, cookieStore };
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await withAuth(id);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Solicitud invalida o sesion no valida.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Payload invalido.' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  if (typeof (body as { firstName?: unknown }).firstName === 'string') {
    payload.firstName = String((body as { firstName: string }).firstName).trim();
  }
  if (typeof (body as { lastName?: unknown }).lastName === 'string') {
    payload.lastName = String((body as { lastName: string }).lastName).trim();
  }
  if (typeof (body as { email?: unknown }).email === 'string') {
    payload.email = String((body as { email: string }).email).trim();
  }
  if ((body as { roleId?: unknown }).roleId !== undefined) {
    const roleId = Number((body as { roleId?: unknown }).roleId);
    if (!Number.isInteger(roleId) || roleId < 1) {
      return NextResponse.json({ success: false, message: 'El rol es invalido.' }, { status: 400 });
    }
    payload.roleId = roleId;
  }
  if (typeof (body as { isActive?: unknown }).isActive === 'boolean') {
    payload.isActive = (body as { isActive: boolean }).isActive;
  }

  if (!Object.keys(payload).length) {
    return NextResponse.json({ success: false, message: 'No hay campos para actualizar.' }, { status: 400 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/users/${auth.userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo actualizar el usuario.' }, { status: 502 });
  }

  const responsePayload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(responsePayload, { status: upstream.status });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await withAuth(id);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Solicitud invalida o sesion no valida.' }, { status: 400 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/users/${auth.userId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo eliminar el usuario.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

