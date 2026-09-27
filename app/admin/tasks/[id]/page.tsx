import type { Metadata } from 'next';
import { AdminOperationalTasksPage } from '@/components/admin-operational-tasks-page';

export const metadata: Metadata = { title: 'Admin | Detalle de tarea', description: 'Ejecución rápida de una tarea operativa.', robots: { index: false, follow: false } };
export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) { return <AdminOperationalTasksPage taskId={(await params).id} />; }
