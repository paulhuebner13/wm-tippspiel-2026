import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { redirect } from 'next/navigation';
import type { Profile } from './types';
import { supabaseAdmin } from './supabaseAdmin';

const cookieName = 'wm_tippspiel_session';

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 20) {
    throw new Error('SESSION_SECRET must be set and should be long.');
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: Profile): Promise<void> {
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    isAdmin: user.is_admin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getCurrentUser(): Promise<Profile | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return null;

  try {
    const verified = await jwtVerify(token, getSecret());
    const userId = verified.payload.userId;

    if (typeof userId !== 'string') return null;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, is_admin')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<Profile> {
  const user = await requireUser();
  if (!user.is_admin) redirect('/matches');
  return user;
}
