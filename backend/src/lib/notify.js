// Notifications: saved to the in-app list (notifications table) and sent as a
// push notification to the user's phones through the Expo push service.
const { query } = require('../config/db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TIMEOUT_MS = 4000;

function pushEnabled() {
  return process.env.PUSH_DISABLED !== '1' && process.env.NODE_ENV !== 'test';
}

async function sendPush(messages) {
  if (!messages.length || !pushEnabled()) return;
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      // Forget tokens Expo says are dead (app uninstalled, etc.).
      const dead = (json?.data || [])
        .map((r, idx) => (r?.details?.error === 'DeviceNotRegistered' ? chunk[idx].to : null))
        .filter(Boolean);
      if (dead.length) await query('delete from public.push_tokens where token = any($1::text[])', [dead]);
    } catch (error) {
      console.warn('push failed:', error.message);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * notify(['<userId>', ...], { type, title, body, data: { url: '/order/123' }, store? })
 * Never throws: a failed notification must not fail the request that caused it.
 */
async function notify(userIds, { type, title, body = '', data = {}, store = true }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    // Chat messages are push-only: the chat list already shows them.
    if (store) await query(
      `insert into public.notifications (user_id, type, title, body, data)
       select unnest($1::uuid[]), $2, $3, $4, $5`,
      [ids, type, title.slice(0, 120), String(body).slice(0, 300), data]
    );
    const { rows } = await query('select token, user_id from public.push_tokens where user_id = any($1::uuid[])', [ids]);
    const unread = await query(
      `select user_id, count(*)::int as n from public.notifications
       where user_id = any($1::uuid[]) and read_at is null group by user_id`,
      [ids]
    );
    const badge = Object.fromEntries(unread.rows.map((r) => [r.user_id, r.n]));
    await sendPush(
      rows.map((r) => ({
        to: r.token,
        title,
        body,
        data: { ...data, type },
        sound: 'default',
        badge: badge[r.user_id] || 1,
        channelId: 'default',
      }))
    );
  } catch (error) {
    console.warn('notify failed:', error.message);
  }
}

/** Notifies every (non-suspended) user with one of the given roles, e.g. ['mover', 'admin']. */
async function notifyRoles(roles, payload) {
  try {
    const { rows } = await query(
      'select id from public.users where role = any($1::text[]) and deleted_at is null and suspended_at is null',
      [roles]
    );
    await notify(rows.map((r) => r.id), payload);
  } catch (error) {
    console.warn('notifyRoles failed:', error.message);
  }
}

module.exports = { notify, notifyRoles };
