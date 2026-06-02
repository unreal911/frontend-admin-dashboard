import type { Metadata } from 'next';
import { AdminPickingBoardPage } from '@/components/admin-picking-board-page';

export const metadata: Metadata = {
  title: 'Admin | Picking',
  description: 'Tablero de picking para preparacion de pedidos.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPickingBoardRoutePage() {
  return <AdminPickingBoardPage />;
}
