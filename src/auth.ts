const COOKIE = 'curio_session';
const MAX_AGE_S = 90 * 86400;
const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function passcodeMatches(given: string, expected: string, secret: string): Promise<boolean> {
  // Compare MACs so timing doesn't leak the passcode length or prefix.
  return safeEqual(await hmac(secret, given), await hmac(secret, expected));
}

export async function sessionCookie(secret: string, secure: boolean): Promise<string> {
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  return `${COOKIE}=${exp}.${await hmac(secret, exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_S}${secure ? '; Secure' : ''}`;
}

export async function hasSession(cookieHeader: string | undefined, secret: string): Promise<boolean> {
  const m = cookieHeader?.match(new RegExp(`${COOKIE}=(\\d+)\\.([\\w-]+)`));
  if (!m || Number(m[1]) < Date.now()) return false;
  return safeEqual(m[2], await hmac(secret, m[1]));
}
