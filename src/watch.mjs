// Compare this hour's App Store states with the last ones and say what moved.
// The event id matches Lobby's local watcher exactly, so while both run Cue logs each change once.
export const eventId = (app, version, state) => `review:${app}:${version}|${state}`.replace(/[^\w.:-]/g, '_').slice(0, 120);

export function diff(last, now) {
  const changes = [];
  for (const [bundle, s] of Object.entries(now)) {
    const was = last[bundle];
    if (was && was.state && (was.version !== s.version || was.state !== s.state)) {
      changes.push({ type: 'app.review.changed', id: eventId(s.app, s.version, s.state), data: { app: s.app, version: s.version, from: was.state, to: s.state } });
    }
  }
  return changes;
}
