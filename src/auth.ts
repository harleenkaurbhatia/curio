import { newToken, sha256 } from './core/password';

export const COOKIE = 'curio_sid';
export const SESSION_DAYS = 90;

export async function issueSession(): Promise<{ token: string; hash: string; expiresAt: number }> {
  const token = newToken();
  return { token, hash: await sha256(token), expiresAt: Date.now() + SESSION_DAYS * 86_400_000 };
}

export function sessionCookie(token: string, secure: boolean, maxAgeS = SESSION_DAYS * 86400): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`;
}

export function tokenFrom(cookieHeader: string | undefined): string | null {
  const m = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`));
  return m ? m[1] : null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
