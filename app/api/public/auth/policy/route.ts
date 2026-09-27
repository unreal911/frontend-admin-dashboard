import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

export async function GET() {
  const upstream = await fetch(`${getAdminApiUrl()}/public/auth/policy`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!upstream) {
    return NextResponse.json({ message: 'No se pudo consultar la política de acceso.' }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => null);
  return NextResponse.json(payload, { status: upstream.status });
}
