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

export async function GET() {
  const auth = await withToken();
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/users`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudieron cargar usuarios.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => []);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(request: Request) {
  const auth = await withToken();
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Payload invalido.' }, { status: 400 });
  }

  const firstName = String((body as { firstName?: unknown }).firstName || '').trim();
  const lastName = String((body as { lastName?: unknown }).lastName || '').trim();
  const email = String((body as { email?: unknown }).email || '').trim();
  const password = String((body as { password?: unknown }).password || '').trim();
  const roleId = Number((body as { roleId?: unknown }).roleId);
  const isActiveRaw = (body as { isActive?: unknown }).isActive;
  const isActive = typeof isActiveRaw === 'boolean' ? isActiveRaw : true;

  if (!firstName || !lastName || !email || !password || !Number.isInteger(roleId) || roleId < 1) {
    return NextResponse.json(
      { success: false, message: 'Nombre, apellido, email, password y rol son obligatorios.' },
      { status: 400 },
    );
  }

  const upstream = await fetch(`${getAdminApiUrl()}/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      firstName,
      lastName,
      email,
      password,
      roleId,
      isActive,
    }),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ success: false, message: 'No se pudo crear el usuario.' }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  applyTokenRefresh(upstream, auth.cookieStore);
  return NextResponse.json(payload, { status: upstream.status });
}

