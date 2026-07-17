// App shell: navy sidebar with the white alfanar logo + mist content area.
// Brand ratio ≈ 58% white/mist, 24% navy, 14% alfanar Blue, 4% sky.
import Link from 'next/link';
import Image from 'next/image';
import type { SessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth-actions';
import { NavLink } from './NavLink';

const LOGO_WHITE = 'https://www.alfanar.com/assets/icons/logo-white.svg';

interface NavItem {
  href: string;
  label: string;
  roles?: string[];
}

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/ncrs', label: 'NCR Register' },
  { href: '/ncrs/new', label: 'New NCR', roles: ['ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN'] },
  { href: '/approvals', label: 'Approvals', roles: ['QC_MANAGER', 'ADMIN'] },
  { href: '/import-export', label: 'Import / Export' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/admin', label: 'Admin', roles: ['ADMIN'] },
];

export function Shell({
  user,
  unread,
  children,
}: {
  user: SessionUser;
  unread: number;
  children: React.ReactNode;
}) {
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  return (
    <div className="flex min-h-screen">
      {/* navy sidebar */}
      <aside className="w-60 shrink-0 bg-navy text-white flex flex-col sticky top-0 h-screen">
        <div className="px-6 pt-7 pb-6 border-b border-white/10">
          {/* Official white logo on navy — never recolored or stretched */}
          <Image src={LOGO_WHITE} alt="alfanar" width={132} height={36} unoptimized priority />
          <div className="micro-label mt-4" style={{ color: 'rgba(255,255,255,.55)' }}>
            NCR · MV Switchgear
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
              {n.href === '/notifications' && unread > 0 && (
                <span
                  className="mono text-[10px] px-1.5 py-0.5 rounded-full ml-auto"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-5 border-t border-white/10">
          <div className="text-[13px] font-medium">{user.name}</div>
          <div className="mono text-[10.5px] tracking-widest uppercase mt-0.5" style={{ color: 'var(--sky)' }}>
            {user.role.replace('_', ' ')}
          </div>
          <form action={logoutAction} className="mt-3">
            <button className="text-[12px] underline-offset-2 hover:underline" style={{ color: 'rgba(255,255,255,.6)' }}>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* mist content */}
      <div className="flex-1 flex flex-col min-w-0 brand-grid-bg">
        <main className="flex-1 px-8 py-7 max-w-[1400px] w-full mx-auto">{children}</main>
        <footer className="px-8 py-5 flex items-center justify-between border-t" style={{ borderColor: 'var(--line2)' }}>
          <span className="micro-label">THE POWER OF EXCELLENCE</span>
          <span className="micro-label">
            <Link href="https://www.alfanar.com" target="_blank" rel="noreferrer">alfanar.com</Link>
          </span>
        </footer>
      </div>
    </div>
  );
}

/** Brand-book section header: mono §-number + Poppins title. */
export function SectionHead({
  no,
  title,
  sub,
  children,
}: {
  no: string;
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-4 mb-6 flex-wrap">
      <span className="secno">§{no}</span>
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
        {sub && <p className="text-[13.5px] mt-1" style={{ color: 'var(--ink2)' }}>{sub}</p>}
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
