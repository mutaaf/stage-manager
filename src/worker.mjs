// Stage Manager: release tracking in the cloud. Cue's hourly clock calls tick() over a service binding;
// tick reads App Store Connect with a read-only team key and publishes app.review.changed to Cue.
// No cron of its own (the account's five are spoken for), no personal data, no writes to Apple.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { hasKey } from './asc.mjs';
import { tick, RUN } from './tick.mjs';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default class StageManager extends WorkerEntrypoint {
  async tick() { return tick(this.env); }

  async fetch(req) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (path === '/stage/api/health') {
      const run = await this.env.KV.get(RUN, 'json');
      return json({ ok: true, service: 'stage-manager', key: hasKey(this.env) ? 'installed' : 'missing', lastRun: run });
    }
    return json({ ok: false, error: 'not found' }, 404);
  }
}
