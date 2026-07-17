// §08 Notifications — in-app queue events (email delivery is stubbed by design).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { SectionHead } from '@/components/Shell';
import { MarkAllReadButton, MarkReadButton } from '@/components/importexport/NotificationButtons';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <SectionHead no="08" title="Notifications" sub={`${unread} unread`}>
        <MarkAllReadButton disabled={unread === 0} />
      </SectionHead>

      <div className="space-y-2 max-w-3xl">
        {notifications.map((n) => (
          <div key={n.id} className="card p-4 flex items-center gap-4"
            style={!n.readAt ? { borderLeft: '3px solid var(--accent)', background: '#fff' } : { opacity: 0.75 }}>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px]">{n.message}</p>
              <p className="mono text-[11px] mt-0.5" style={{ color: 'var(--slate)' }}>
                {fmtDateTime(n.createdAt)} · {n.type}
              </p>
            </div>
            {n.ncrId != null && (
              <Link href={`/ncrs/${n.ncrId}`} className="mono text-[12px] whitespace-nowrap hover:underline"
                style={{ color: 'var(--accent)' }}>
                NCR →
              </Link>
            )}
            {!n.readAt && <MarkReadButton id={n.id} />}
          </div>
        ))}
        {notifications.length === 0 && (
          <div className="card p-12 text-center">
            <p className="text-[14px] font-medium">No notifications</p>
            <p className="micro-label mt-2">you will be notified when an NCR enters your queue</p>
          </div>
        )}
      </div>
    </>
  );
}
