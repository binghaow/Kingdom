/* Desktop RTS controls + building groups (feature/controls-groups). Pure decision helpers only: no DOM, no simulation
   writes. expansion.js asks these questions and then issues the result through the usual command entry points
   (sim.order / sim.train / sim.setRally), so single player, the simulation worker and lockstep all see ordinary commands.

   Exposed to the old scripts as window.KingdomCore.controls (bridge rule, src/index.js). */

/** What a mouse click on the battlefield means. Touch and pen never come here (their path in expansion.js is unchanged).
 *  button: 0 left, 1 middle, 2 right; armed: an explicit order mode from a command button or the A key ('move' |
 *  'advance' | 'rally' | null); attackKey: A is held; hasUnits: own movable units are selected.
 *  Returns 'cancel-build' | 'place' | 'command' | 'attack-move' | 'select' | 'none'. Left click never returns a plain
 *  smart command: without an armed order it only selects (a left click on empty ground clears the selection). */
export function mouseIntent({ button, buildMode = false, armed = null, attackKey = false, hasUnits = false }) {
  if (button === 2) return buildMode ? 'cancel-build' : 'command';
  if (button !== 0) return 'none';
  if (buildMode) return 'place';
  if (hasUnits && (attackKey || armed === 'advance')) return 'attack-move';
  if (armed) return 'command';
  return 'select';
}

/** Box selection rule: own units inside the box win; only when there are none are own buildings selected. */
export function boxPick(units, buildings) {
  return units.length ? units : buildings;
}

/** Same-kind production buildings: the one with the shortest queue gets the order; ties rotate starting at `cursor`
 *  (so with all queues equal - or a network replica that has not applied the last order yet - clicks go 1, 2, 3, ...).
 *  `usable(b)` filters buildings that can take this order right now. Returns { pick, cursor } (pick null when none). */
export function pickProducer(buildings, cursor = 0, usable = () => true) {
  const n = buildings.length;
  let pick = null, at = -1, best = Infinity;
  for (let k = 0; k < n; k++) {
    const i = (cursor + k) % n, b = buildings[i];
    if (!b || !usable(b)) continue;
    const q = b.queue ? b.queue.length : 0;
    if (q < best) { best = q; pick = b; at = i; }
  }
  return { pick, cursor: pick ? (at + 1) % n : cursor };
}

/** Double click: the same own entity kind clicked twice within `ms`. */
export function isDoubleClick(last, now, kind, ms = 380) {
  return !!last && last.kind === kind && now - last.at <= ms;
}

/** Rectangle in world units that the camera shows (for "select all of this kind on screen"). */
export function onScreen(e, camera, vw, vh) {
  return Math.abs(e.x - camera.x) <= vw / 2 / camera.z && Math.abs(e.y - camera.y) <= vh / 2 / camera.z;
}
