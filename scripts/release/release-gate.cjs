#!/usr/bin/env node
/* Fast publish gate.
 *
 * The full release-check (~8 min) and check-all (~15 min) are slow, and their timing thresholds only compare
 * like-for-like on the same machine. A different machine (e.g. a Windows PC) produces spurious timing FAILs
 * and then has to rebuild baselines and rerun everything.
 *
 * Rule: if docs/release-reports already holds a full release-check for a commit whose *code* (public/, src/,
 * server/, worker/, scripts/, package.json, check-*.cjs) is identical to HEAD, with 0 FAIL, the heavy checks
 * have already passed for exactly this code. Then publishing only needs build + artifact + syntax + bundle
 * check. (scripts/release itself is excluded: changing the checks does not change the game.) Otherwise it tells you to run the full checks once (timing checks are judged on one machine).
 *
 *   node scripts/release/release-gate.cjs           # decide + run the fast path when allowed
 *   node scripts/release/release-gate.cjs --dry     # only print the decision
 */
'use strict';
const { execSync, execFileSync } = require('child_process');
// git is called without a shell (execFileSync + argument arrays) so it works the same in bash, cmd.exe and PowerShell.
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const CODE = ['public', 'src', 'server', 'worker', 'scripts', 'package.json'];
const sh = (c, o = {}) => execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: o.inherit ? 'inherit' : 'pipe' });
const dry = process.argv.includes('--dry');

function codeSame(commit) {
  try { git('cat-file', '-e', commit + '^{commit}'); } catch { return false; }
  const checks = git('ls-files', 'check-*.cjs').split('\n').filter(Boolean);
  try { git('diff', '--quiet', commit, 'HEAD', '--', ...CODE, ...checks, ':(exclude)scripts/release'); return true; } catch { return false; }
}

const dir = path.join(ROOT, 'docs', 'release-reports');
const reports = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse() : [];
let match = null;
for (const f of reports) {
  let r; try { r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
  const commit = r.commit || f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.json$/, '');
  const mode = r.mode || (JSON.stringify(r).includes('"full"') ? 'full' : '');
  const fails = (r.items || r.gates || []).filter(g => g.status === 'FAIL').length;
  const verdict = r.verdict || '';
  if (verdict === 'FAIL' || fails > 0 || mode === 'quick') continue;
  if (codeSame(commit)) { match = { file: f, commit, verdict }; break; }
}

const head = git('rev-parse', '--short', 'HEAD').trim();
if (!match) {
  console.log(`[release-gate] HEAD ${head}: no passing full release-check report for identical code.`);
  console.log('[release-gate] Run once: node check-all.cjs && npm run build && node check-artifact.cjs && npm run release-check');
  console.log('[release-gate] Timing FAILs on a different machine than the baseline: rerun only that section (npm run release-check -- --only <section>);');
  console.log('[release-gate] a FAIL that does not reproduce on rerun is noise. Correctness checks (check-all, artifact, multiplayer) must never fail.');
  process.exit(2);
}
console.log(`[release-gate] HEAD ${head} has the same code as ${match.commit}, which passed the full release-check (${match.file}, ${match.verdict}).`);
console.log('[release-gate] Fast path: build + artifact + browser syntax + core bundle.');
if (dry) process.exit(0);
try {
  sh('npm run build', { inherit: true });
  sh('node check-artifact.cjs', { inherit: true });
  sh('node check-browser-syntax.cjs', { inherit: true });
  if (fs.existsSync(path.join(ROOT, 'check-core-bundle.cjs'))) sh('node check-core-bundle.cjs', { inherit: true });
} catch (e) { console.log('[release-gate] FAIL: fast-path check failed — do not publish.'); process.exit(1); }
console.log(`[release-gate] PASS — publish ${head}. Attach docs/release-reports/${match.file.replace('.json', '.md')} to the release notes.`);
