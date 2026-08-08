import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

const ADMIN_SESSION_COOKIE = 'admin_session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = String(cookieStore.get(ADMIN_SESSION_COOKIE)?.value || '').trim();
  if (!token) {
    return NextResponse.json({ success: false, message: 'Sesion no valida.' }, { status: 401 });
  }

  const upstreamAbort = new AbortController();
  const abortUpstream = () => upstreamAbort.abort();
  if (request.signal.aborted) {
    abortUpstream();
  } else {
    request.signal.addEventListener('abort', abortUpstream, { once: true });
  }

  const upstream = await fetch(`${getAdminApiUrl()}/admin-events/stream`, {
    method: 'GET',
    headers: {
      accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
    signal: upstreamAbort.signal,
  }).catch(() => null);

  if (!upstream?.ok || !upstream.body) {
    request.signal.removeEventListener('abort', abortUpstream);
    return NextResponse.json({ success: false, message: 'No se pudo abrir el canal de eventos.' }, { status: 502 });
  }

  const reader = upstream.body.getReader();
  const cleanup = () => {
    request.signal.removeEventListener('abort', abortUpstream);
    abortUpstream();
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        cleanup();
        if (!request.signal.aborted) controller.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      await reader.cancel(reason).catch(() => undefined);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
