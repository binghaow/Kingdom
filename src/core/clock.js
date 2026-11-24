/* P4 fixed-step clock (redesign-plan.md P4, scale-target.md section 2: 20 simulation steps per second).

   The simulation always advances in whole steps of STEP = 0.05 s of game time, whatever the display refresh rate; rendering
   interpolates unit positions between the last two steps (public/unit-motion.js A.renderUnit, alpha = accumulator / STEP).
   A slow frame may run several steps to catch up, at most MAX_STEPS; a frame longer than MAX_DT counts as MAX_DT, and any
   backlog still left after MAX_STEPS is dropped (the game runs slower instead of spiralling: each extra step would make the
   next frame even longer). Online play (src/net/lockstep.js) runs the same 0.05 s step, two per 100 ms relay turn.

   Pure module: no DOM, no clock of its own (the caller passes the elapsed time). Used by expansion.js (main-thread
   simulation, through window.KingdomCore.clock) and by the simulation worker client (src/sim/client.js). */

export const STEP = 0.05;          // seconds of game time per simulation step (20 steps per second)
export const STEPS_PER_SECOND = 20;
export const MAX_DT = 0.25;        // a frame longer than this (tab stall, GC pause, 4 fps) counts as 0.25 s
export const MAX_STEPS = 4;        // at most 4 catch-up steps per displayed frame

/* Accumulator. frame(seconds) returns how many steps are due now; alpha is the fraction of the next step already elapsed. */
export class FixedStep {
  constructor({ step = STEP, maxDt = MAX_DT, maxSteps = MAX_STEPS } = {}) {
    this.step = step; this.maxDt = maxDt; this.maxSteps = maxSteps; this.acc = 0; this.dropped = 0; this.steps = 0;
  }
  frame(seconds) {
    this.acc += Math.min(Math.max(Number(seconds) || 0, 0), this.maxDt);
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) { this.acc -= this.step; n++; }
    if (this.acc >= this.step) { const drop = Math.floor(this.acc / this.step); this.dropped += drop; this.acc -= drop * this.step; }
    this.steps += n;
    return n;
  }
  get alpha() { return Math.min(1, Math.max(0, this.acc / this.step)); }
  reset() { this.acc = 0; }
}
