// Authenticated area — session is checked server-side on every request.
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { unreadNotificationCount } from '@/lib/queries';
import { Shell } from '@/components/Shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const unread = await unreadNotificationCount(user.id);
  return (
    <Shell user={user} unread={unread}>
      {children}
    </Shell>
  );
}
