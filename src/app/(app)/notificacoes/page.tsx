import { getSessionUser } from '@/lib/auth/session';
import { listNotifications } from '@/lib/notifications';
import { NotificationsList } from '@/components/layout/notifications-list';
import { Bell } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function NotificacoesPage() {
  const user = (await getSessionUser())!;
  const items = await listNotifications(user, 80);
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Bell className="h-5 w-5 text-accent" /> Notificações</h1>
      <NotificationsList
        items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: n.read, critical: n.critical, createdAt: n.createdAt.toISOString() }))}
      />
    </div>
  );
}
