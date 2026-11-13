/**
 * Automated combat test (T23 + T24).
 *
 * Scenario A: send the squad down the SHORT route. Invaders should spot it,
 *             chase, attack; sentinels should fight back.
 * Scenario B: reload, restore the East Relay, send the squad down the LONG
 *             route. Nobody should be attacked.
 * Screenshots + the game log are saved to .iwsdk/test-results/.
 *
 * Run (with `npm run dev` already running in another terminal):
 *   node scripts/test-combat.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cli = join('node_modules', '@iwsdk', 'cli', 'dist', 'cli.js');
const outDir = join('.iwsdk', 'test-results');
mkdirSync(outDir, { recursive: true });
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

function iwsdk(label, args, input = {}) {
  process.stdout.write(`- ${label} ... `);
  try {
    const text = execFileSync(
      process.execPath,
      [cli, ...args, '--input-json', JSON.stringify(input), '--timeout', '60000'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 },
    );
    console.log('ok');
    return text;
  } catch (error) {
    console.log('FAILED');
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

async function waitUntilReady(label) {
  process.stdout.write(`- ${label} `);
  for (let i = 0; i < 30; i++) {
    try {
      const text = execFileSync(process.execPath, [cli, 'xr', 'status', '--input-json', '{}', '--timeout', '10000'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
      });
      if (/"ok"\s*:\s*true/.test(text)) return console.log(' ready');
    } catch { /* not ready yet */ }
    process.stdout.write('.');
    await wait(3);
  }
  console.log(' gave up');
}

function screenshot(name) {
  const text = iwsdk(`screenshot (${name})`, ['browser', 'screenshot']);
  const match = text.match(/"screenshotPath"\s*:\s*"([^"]+)"/);
  if (match) {
    const src = JSON.parse(`"${match[1]}"`);
    if (existsSync(src)) copyFileSync(src, join(outDir, `${name}.png`));
  }
}

const press = (key, label) => iwsdk(label, ['browser', 'interact'], { steps: [{ action: 'press', key }] });

/** Reload, enter XR and look straight down at the board. */
async function freshBoard() {
  await waitUntilReady('waiting for the emulator window');
  iwsdk('reload the game page', ['browser', 'reload']);
  await wait(2);
  await waitUntilReady('waiting for the page to load');
  await wait(2);
  iwsdk('enter XR', ['xr', 'enter']);
  await wait(4);
  const targets = iwsdk('find the board', ['xr', 'list-targets']);
  const core = JSON.parse(targets).data.result.targets.find((t) => t.name === 'energy-core');
  const { x, y } = core.position;
  const z = core.position.z - 0.15;
  iwsdk('move head above the board', ['xr', 'set-transform'], { device: 'headset', position: { x, y: y + 0.55, z: z + 0.05 } });
  iwsdk('look straight down', ['xr', 'look-at'], { device: 'headset', target: { x, y, z } });
  await wait(1);
}

function readLog(file) {
  const logs = iwsdk('collect logs', ['browser', 'logs'], { count: 200 });
  let lines = [];
  try {
    const entries = JSON.parse(logs)?.data?.result ?? [];
    // Only this scenario: everything after the last board placement.
    const all = entries.map((e) => e.message ?? '');
    const lastPlaced = all.map((m, i) => (/Board placed on/.test(m) ? i : -1)).filter((i) => i >= 0).pop() ?? 0;
    lines = all.slice(lastPlaced).filter((m) => /^\[(units|resources|debug|combat|ai)\]/.test(m));
  } catch {
    lines = ['(could not read the log)'];
  }
  writeFileSync(join(outDir, file), lines.join('\n'));
  return lines;
}

console.log('\n=== Scenario A: short route (should fight) ===');
await freshBoard();
screenshot('combat-0-start');
press('1', 'key 1: squad -> relay by the SHORT route');
await wait(4);
screenshot('combat-1-contact');
await wait(5);
screenshot('combat-2-fight');
await wait(8);
screenshot('combat-3-after');
const shortLog = readLog('combat-short-log.txt');

console.log('\n=== Scenario B: long route (should be safe) ===');
await freshBoard();
press('3', 'key 3: restore the East Relay');
await wait(1);
press('2', 'key 2: squad -> relay by the LONG route');
await wait(23);
screenshot('combat-4-long-arrived');
const longLog = readLog('combat-long-log.txt');

console.log('\nShort route log:');
for (const line of shortLog) console.log('  ' + line);
console.log('\nLong route log:');
for (const line of longLog) console.log('  ' + line);
console.log(`\nDone. Screenshots saved in ${outDir}`);
