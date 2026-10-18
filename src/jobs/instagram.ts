import { parseWebhook, verifySignature } from '../core/instagram';
import { Repo } from '../db';
import type { Env } from './refresh';

const GRAPH = 'https://graph.instagram.com';
const WEEK = 7 * 86_400_000;

// Meta → POST /api/ig/webhook. Returns how many reels/posts were filed.
export async function receiveWebhook(env: Env, raw: string, signature: string | null): Promise<number | 'forbidden'> {
  if (!env.IG_APP_SECRET || !(await verifySignature(raw, signature, env.IG_APP_SECRET))) return 'forbidden';
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return 0; }
  const repo = new Repo(env.DB);
  let filed = 0;
  for (const item of parseWebhook(body)) {
    const account = await repo.igAccount(item.ownerIgId);
    if (!account) continue; // DM for an Instagram account nobody connected
    await rememberSender(repo, item.senderIgId, account.token);
    await repo.addInbox(account.user_id, [item]);
    filed++;
  }
  return filed;
}

// Name and @username of whoever sent it (User Profile API), cached for a week.
async function rememberSender(repo: Repo, igsid: string, token: string) {
  const known = await repo.igSender(igsid);
  if (known && Date.now() - known.fetched_at < WEEK) return;
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(igsid)}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`);
    const p = res.ok ? await res.json<{ name?: string; username?: string; profile_pic?: string }>() : {};
    await repo.saveIgSender({ ig_id: igsid, name: p.name ?? known?.name ?? null, username: p.username ?? known?.username ?? null, pic: p.profile_pic ?? null, fetched_at: Date.now() });
  } catch {
    if (!known) await repo.saveIgSender({ ig_id: igsid, name: null, username: null, pic: null, fetched_at: Date.now() });
  }
}

// The user pastes the long-lived token from Meta's dashboard; we check it and link the account.
export async function connectInstagram(repo: Repo, userId: number, token: string): Promise<{ username: string } | { error: string }> {
  const res = await fetch(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
  if (!res.ok) return { error: 'Instagram did not accept that token. Generate a new one in the Meta dashboard and paste it again.' };
  const me = await res.json<{ id?: string; user_id?: string; username?: string }>();
  const igId = me.user_id ?? me.id;
  if (!igId) return { error: 'Could not read your Instagram account from that token' };
  await repo.saveIgAccount({ ig_id: String(igId), user_id: userId, username: me.username ?? null, token, token_refreshed_at: Date.now() });
  return { username: me.username ?? '' };
}

// Long-lived tokens last 60 days; refresh weekly from the cron.
export async function refreshInstagramTokens(env: Env, now = Date.now()) {
  const repo = new Repo(env.DB);
  for (const a of await repo.igAccountsToRefresh(now - WEEK)) {
    const res = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(a.token)}`);
    if (!res.ok) continue;
    const r = await res.json<{ access_token?: string }>();
    if (r.access_token) await repo.saveIgAccount({ ...a, token: r.access_token, token_refreshed_at: now });
  }
}
