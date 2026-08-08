import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

export async function proxyPublicBackendRequest(
  backendPath: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const upstream = await fetch(`${getAdminApiUrl()}${backendPath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream) {
    return NextResponse.json({ message: 'No se pudo conectar con el backend.' }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => null);
  const responseHeaders = new Headers();
  for (const headerName of [
    'retry-after',
    'ratelimit',
    'ratelimit-policy',
    'ratelimit-limit',
    'ratelimit-remaining',
    'ratelimit-reset',
  ]) {
    const value = upstream.headers.get(headerName);
    if (value) responseHeaders.set(headerName, value);
  }
  return NextResponse.json(payload, { status: upstream.status, headers: responseHeaders });
}
