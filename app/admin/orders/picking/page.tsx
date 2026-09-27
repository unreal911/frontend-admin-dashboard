import { redirect } from 'next/navigation';

export default async function AdminPickingBoardRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const query = new URLSearchParams({ view: 'preparation' });
  if (status) query.set('status', status);
  redirect(`/admin/orders/list?${query.toString()}`);
}
