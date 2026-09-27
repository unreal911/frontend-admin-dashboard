import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

export async function POST() {
  const cookieStore = await cookies();
  const token = String(cookieStore.get('admin_session')?.value || '').trim();
  if (!token) return NextResponse.json({ message: 'Sesion no valida.' }, { status: 401 });

  const upstream = await fetch(`${getAdminApiUrl()}/system-config/marketplace-theme/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: 'No se pudo conectar con la API.' }, { status: 502 });

  const refreshed = String(upstream.headers.get('x-access-token') || '').trim();
  if (refreshed) cookieStore.set('admin_session', refreshed, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 });
  const payload = await upstream.json().catch(() => ({ message: 'Respuesta invalida de la API.' }));
  return NextResponse.json(payload, { status: upstream.status });
}
