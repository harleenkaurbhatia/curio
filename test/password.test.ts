import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, newToken, sha256 } from '../src/core/password';
import { guestEmail, isGuest } from '../src/core/guest';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^pbkdf2\$\d+\$/);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
  });
  it('salts: same password gives different hashes', async () => {
    expect(await hashPassword('x')).not.toBe(await hashPassword('x'));
  });
  it('rejects malformed stored values', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
  it('makes long random tokens and stable sha256 digests', async () => {
    const t = newToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(newToken()).not.toBe(t);
    expect(await sha256('abc')).toBe(await sha256('abc'));
  });
});

describe('guest accounts', () => {
  it('makes a unique placeholder email that is recognised as a guest', () => {
    const a = guestEmail(), b = guestEmail();
    expect(a).not.toBe(b);
    expect(isGuest(a)).toBe(true);
    expect(isGuest('harleen@gmail.com')).toBe(false);
  });
  it('a guest has no password, so no password can sign in as one', async () => {
    expect(await verifyPassword('', '')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });
});
