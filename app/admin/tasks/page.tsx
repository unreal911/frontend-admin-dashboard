import type { Metadata } from 'next';
import { AdminOperationalTasksPage } from '@/components/admin-operational-tasks-page';

export const metadata: Metadata = { title: 'Admin | Mis tareas', description: 'Centro de trabajo operativo.', robots: { index: false, follow: false } };
export default function TasksPage() { return <AdminOperationalTasksPage />; }
