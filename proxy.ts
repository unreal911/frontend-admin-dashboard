import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

type SessionProbe = {
  state: 'anonymous' | 'valid' | 'invalid' | 'unavailable';
  refreshedToken?: string;
};

async function probeSession(request: NextRequest): Promise<SessionProbe> {
  const token = String(request.cookies.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) return { state: 'anonymous' };

  const upstream = await fetch(`${getAdminApiUrl()}/auth/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!upstream) return { state: 'unavailable' };
  if (upstream.ok) {
    const refreshedToken = String(upstream.headers.get('x-access-token') || '').trim();
    return { state: 'valid', ...(refreshedToken ? { refreshedToken } : {}) };
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return { state: 'invalid' };
  }
  return { state: 'unavailable' };
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

function persistRefreshedToken(response: NextResponse, token?: string) {
  if (!token) return;
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (pathname.startsWith('/admin')) {
    if (hasSession) return NextResponse.next();

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    if (pathname !== '/admin') loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/' || pathname === '/login') {
    const session = await probeSession(request);
    if (session.state === 'valid') {
      const response = redirectTo(request, '/admin/dashboard');
      persistRefreshedToken(response, session.refreshedToken);
      return response;
    }

    if (pathname === '/') {
      const response = redirectTo(request, '/login');
      if (session.state === 'invalid') response.cookies.delete(ADMIN_SESSION_COOKIE);
      return response;
    }

    const response = NextResponse.next();
    if (session.state === 'invalid') response.cookies.delete(ADMIN_SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/login'],
};
