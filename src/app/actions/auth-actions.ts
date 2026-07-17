'use server';

import { redirect } from 'next/navigation';
import { login, logout } from '@/lib/auth';
import { loginSchema } from '@/lib/validate';

export interface ActionState {
  error?: string;
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Enter a valid email and password' };
  const user = await login(parsed.data.email, parsed.data.password);
  if (!user) return { error: 'Invalid credentials or inactive account' };
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/login');
}
