import { NextResponse } from 'next/server';
import { getAdminApiUrl } from '@/lib/admin-api-config';

export async function GET() {
  const api = getAdminApiUrl();
  const [plansResponse, methodsResponse] = await Promise.all([
    fetch(`${api}/public/saas/plans`, { cache: 'no-store' }).catch(() => null),
    fetch(`${api}/public/saas/payment-methods`, { cache: 'no-store' }).catch(() => null),
  ]);
  if (!plansResponse?.ok || !methodsResponse?.ok) {
    return NextResponse.json({ message: 'No se pudo cargar el catálogo de suscripción.' }, { status: 502 });
  }
  const [plans, paymentMethods] = await Promise.all([
    plansResponse.json().catch(() => []),
    methodsResponse.json().catch(() => []),
  ]);
  return NextResponse.json({ plans, paymentMethods });
}
