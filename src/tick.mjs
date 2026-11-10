// One hourly pass. Kept out of worker.mjs so it can be tested in Node.
import { hasKey, token, client, states } from './asc.mjs';
import { diff } from './watch.mjs';

const STATE = 'review-state'; export const RUN = 'last-run';

export async function tick(env, f = fetch) {
  const at = new Date().toISOString();
  if (!hasKey(env)) { await env.KV.put(RUN, JSON.stringify({ at, ok: false, why: 'no Apple key yet' })); return { ok: false, why: 'no Apple key yet' }; }
  let now;
  try { now = await states(client(await token(env), f)); } catch (e) {
    await env.KV.put(RUN, JSON.stringify({ at, ok: false, why: String(e.message).slice(0, 200) }));
    throw e; // Cue retries, then dead-letters and emails: a revoked or under-powered key gets noticed.
  }
  const last = (await env.KV.get(STATE, 'json')) ?? {};
  const changes = diff(last, now);
  let published = 0;
  for (const c of changes) { const r = await env.CUE.publish(c); if (!r?.ok) throw new Error(`cue refused ${c.id}: ${r?.error ?? r?.why ?? 'unknown'}`); published++; }
  // Only remember what Cue accepted, so a failed publish is retried next hour. Write only on change (KV free tier).
  if (JSON.stringify(last) !== JSON.stringify(now)) await env.KV.put(STATE, JSON.stringify(now));
  await env.KV.put(RUN, JSON.stringify({ at, ok: true, apps: Object.keys(now).length, published }));
  return { ok: true, apps: Object.keys(now).length, published };
}
