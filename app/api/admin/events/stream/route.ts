import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/admin-events/stream`, {
    method: 'GET',
    headers: {
      accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ success: false, message: 'No se pudo abrir el canal de eventos.' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
