'use strict';
/* 3e: restore an online save through the lobby for the harness (scripts/lockstep/harness.cjs makeRoom): host creates the
   restore room, uploads the command segments and (when the save has one) the snapshot parts, the second seat joins and
   claims (claim = true), both ready, host starts. The same requests network-ui.js restoreRoom() sends. */
function makeRestoreRoom(saves, s, { claim = true, decoded = null, segmentBytes = 8000 } = {}) {
  return async ({ base, api }) => {
    const sg = saves.segments(s, segmentBytes), parts = s.snapshot ? saves.snapshotParts(s) : [];
    const snapshot = s.snapshot ? { turn: s.snapshot.turn, hash: s.snapshot.hash, enc: s.snapshot.enc, aiSeats: s.snapshot.aiSeats, parts: parts.length } : null;
    const host = await api(base, '/api/rooms', { name: 'Bot 1', nation: s.room.players[0].nation, config: { ...s.room.config, capacity: 2 }, restore: { setup: s.setup, seats: s.seats, players: s.room.players, turns: s.turns, period: s.period, aiSeats: s.aiSeats, segments: sg.length, self: 0, ...(snapshot ? { snapshot } : {}) } });
    const id = host.room.id, tokens = { 0: host.token }, t0 = Date.now();
    for (const x of sg) await api(base, '/api/rooms/' + id, { action: 'restoreChunk', lastTurn: x.lastTurn, rows: x.rows }, host.token);
    for (let i = 0; i < parts.length; i++) await api(base, '/api/rooms/' + id, { action: 'restoreSnap', part: i, data: parts[i] }, host.token);
    const uploadMs = Date.now() - t0;
    if (claim) { const j = await api(base, '/api/rooms/' + id + '/join', { name: 'Bot 2' }); tokens[j.room.self] = j.token; await api(base, '/api/rooms/' + id, { action: 'settings', ready: true }, j.token); }
    await api(base, '/api/rooms/' + id, { action: 'settings', ready: true }, host.token);
    const ls = (await api(base, '/api/rooms/' + id, { action: 'start' }, host.token)).room.lockstep;
    return { id, setup: ls.setup, startAt: ls.startAt, period: ls.period, allSeats: ls.seats, resume: ls.snap || null, replaySnapshot: ls.snap ? decoded : null,
      upload: { segments: sg.length, rows: sg.reduce((n, x) => n + x.rows.length, 0), snapshotParts: parts.length, ms: uploadMs },
      seats: ls.seats.filter((x) => tokens[x.seat]).map((x) => ({ ...x, token: tokens[x.seat] })) };
  };
}
module.exports = { makeRestoreRoom };
