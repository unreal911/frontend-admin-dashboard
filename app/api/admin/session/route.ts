import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

interface AdminLoginResponse {
  token?: string;
  user?: {
    id?: number | string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: unknown;
    tenant?: unknown;
    membership?: unknown;
  };
  tenants?: Array<{
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    role?: unknown;
  }>;
  message?: string;
  code?: string;
  action?: string;
}

function mapErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '').trim();
  const tenantSlug = String(payload?.tenantSlug || '').trim().toLowerCase();

  if (!email || !password) {
    return NextResponse.json(
      { success: false, message: 'Correo y contrasena son obligatorios.' },
      { status: 400 },
    );
  }

  const apiUrl = `${getAdminApiUrl()}/auth/login`;
  const upstream = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, ...(tenantSlug ? { tenantSlug } : {}) }),
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json(
      { success: false, message: 'No se pudo conectar con el backend de autenticacion.' },
      { status: 502 },
    );
  }

  const result = (await upstream.json().catch(() => null)) as AdminLoginResponse | null;
  if (!upstream.ok) {
    if (upstream.status === 409 && Array.isArray(result?.tenants)) {
      return NextResponse.json({
        success: false,
        selectionRequired: true,
        message: mapErrorMessage(result, 'Selecciona una empresa.'),
        tenants: result.tenants,
      }, { status: 409 });
    }
    return NextResponse.json(
      {
        success: false,
        message: mapErrorMessage(result, 'Credenciales invalidas.'),
        ...(result?.code ? { code: result.code } : {}),
        ...(result?.action ? { action: result.action } : {}),
      },
      { status: upstream.status || 401 },
    );
  }

  const token = String(result?.token || '').trim();
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'El backend no devolvio token de sesion.' },
      { status: 502 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({
    success: true,
    user: result?.user || { email },
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();

  if (token) {
    const apiUrl = `${getAdminApiUrl()}/auth/logout`;
    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    }).catch(() => null);
  }

  cookieStore.delete(ADMIN_SESSION_COOKIE);
  return NextResponse.json({ success: true });
}
