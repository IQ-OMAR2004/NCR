'use client';

import { useActionState } from 'react';
import Image from 'next/image';
import { loginAction, type ActionState } from '@/app/actions/auth-actions';

const LOGO_BLUE = 'https://www.alfanar.com/assets/images/logo-blue.svg';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {});

  return (
    <div className="min-h-screen brand-grid-bg sky-glow flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          <Image src={LOGO_BLUE} alt="alfanar" width={148} height={40} unoptimized priority />
          <div className="micro-label mt-5">NCR Management · MV Switchgear</div>
          <h1 className="text-[22px] font-bold mt-1 mb-6">Sign in</h1>

          <form action={formAction} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email"
                className="input" placeholder="you@alfanar.com" />
            </div>
            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" required autoComplete="current-password"
                className="input" placeholder="••••••••" />
            </div>
            {state.error && (
              <p role="alert" className="text-[13px]" style={{ color: 'var(--danger)' }}>{state.error}</p>
            )}
            <button type="submit" disabled={pending} className="btn btn-primary w-full justify-center">
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--line2)' }}>
            <p className="micro-label mb-2">Demo accounts · password: alfanar123</p>
            <ul className="mono text-[11.5px] space-y-1" style={{ color: 'var(--ink2)' }}>
              <li>originator@alfanar.com — create NCRs</li>
              <li>engineer@alfanar.com — review &amp; propose</li>
              <li>manager@alfanar.com — approve gates</li>
              <li>admin@alfanar.com — everything</li>
              <li>viewer@alfanar.com — read only</li>
            </ul>
          </div>
        </div>
        <p className="micro-label text-center mt-6">THE POWER OF EXCELLENCE</p>
      </div>
    </div>
  );
}
