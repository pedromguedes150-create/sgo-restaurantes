import { getSessionUser } from '@/lib/auth/session';
import { listNotifications } from '@/lib/notifications';
import { NotificationsList } from '@/components/layout/notifications-list';
import { Bell } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function NotificacoesPage() {
  const user = (await getSessionUser())!;
  const items = await listNotifications(user, 80);
  return (
    <div className="space-y-4">
      <LargeTitle title="Notificações" />
      <NotificationsList
        items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: n.read, critical: n.critical, module: n.module, createdAt: n.createdAt.toISOString() }))}
      />
    </div>
  );
}
