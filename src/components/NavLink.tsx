'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active =
    href === '/' ? pathname === '/' : pathname === href || (href !== '/ncrs/new' && pathname.startsWith(`${href}/`)) ||
    (href === '/ncrs' && pathname.startsWith('/ncrs/') && !pathname.startsWith('/ncrs/new'));
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors"
      style={
        active
          ? { background: 'var(--accent)', color: '#fff' }
          : { color: 'rgba(255,255,255,.72)' }
      }
    >
      {children}
    </Link>
  );
}
