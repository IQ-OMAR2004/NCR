// Session auth: HMAC-signed cookie, bcryptjs passwords. No client-trusted state —
// every server action / route handler re-reads the cookie and re-checks the role.
import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import type { Role } from './domain';
import { ROLES } from './domain';

const COOKIE = 'ncr_session';
const MAX_AGE_S = 60 * 60 * 12; // 12h shift-length session

function secret(): string {
  return process.env.SESSION_SECRET ?? 'dev-only-secret-change-me';
}

interface SessionPayload {
  uid: string;
  exp: number; // unix seconds
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function encodeSession(uid: string): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S } satisfies SessionPayload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = decodeSession(store.get(COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || !user.active) return null;
  if (!(ROLES as readonly string[]).includes(user.role)) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role as Role, department: user.department };
}

/** Throws if unauthenticated (or authenticated below the required roles). */
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('Not signed in');
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new AuthError(`Requires role: ${roles.join(' or ')}`);
  }
  return user;
}

export class AuthError extends Error {}

export async function login(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const store = await cookies();
  store.set(COOKIE, encodeSession(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_S,
    path: '/',
  });
  await prisma.auditLog.create({ data: { actorId: user.id, action: 'LOGIN' } });
  return { id: user.id, email: user.email, name: user.name, role: user.role as Role, department: user.department };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}
