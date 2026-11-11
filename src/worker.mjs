// Stage Manager: release tracking in the cloud. Cue's hourly clock calls tick() over a service binding;
// tick reads App Store Connect with a read-only team key and publishes app.review.changed to Cue.
// No cron of its own (the account's five are spoken for), no personal data, no writes to Apple.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { hasKey } from './asc.mjs';
import { tick, RUN } from './tick.mjs';
import { log, timed } from 'stagehand';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default class StageManager extends WorkerEntrypoint {
  // Cue's hourly clock: one {service, event, ms, ok} line per run (stagehand).
  async tick() { return timed('stage-manager', 'tick', () => tick(this.env)); }

  // Read-only store facts for Cast List (github.com/mutaaf/cast-list): what Apple said on the last hourly read.
  async snapshot() { return { at: (await this.env.KV.get(RUN, 'json'))?.at ?? null, apps: (await this.env.KV.get('review-state', 'json')) ?? {} }; }

  async fetch(req) {
    const t = Date.now();
    let res;
    try { res = await this.route(req); } catch (e) { log('stage-manager', 'request', { method: req.method, ms: Date.now() - t, ok: false, error: String(e?.message ?? e).slice(0, 200) }); throw e; }
    log('stage-manager', 'request', { method: req.method, route: res.status === 404 ? 'unmatched' : '/stage/api/health', status: res.status, ms: Date.now() - t, ok: res.status < 500 });
    return res;
  }

  async route(req) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (path === '/stage/api/health') {
      const run = await this.env.KV.get(RUN, 'json');
      return json({ ok: true, service: 'stage-manager', key: hasKey(this.env) ? 'installed' : 'missing', lastRun: run });
    }
    return json({ ok: false, error: 'not found' }, 404);
  }
}
