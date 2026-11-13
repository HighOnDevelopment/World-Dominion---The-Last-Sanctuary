/**
 * Automated movement test (T14 + T16).
 *
 * In the managed emulator window: enters XR, looks down at the board, then
 * uses the debug keys to send the squad along the short route, tries the
 * long route while it is closed, restores the East Relay (spends Energy),
 * and sends the squad along the long route. Screenshots + logs are saved to
 * .iwsdk/test-results/.
 *
 * Run (with `npm run dev` already running in another terminal):
 *   node scripts/test-movement.mjs
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

await waitUntilReady('waiting for the emulator window');
iwsdk('reload the game page', ['browser', 'reload']);
await wait(2);
await waitUntilReady('waiting for the page to load');
await wait(2);
iwsdk('enter XR', ['xr', 'enter']);
await wait(4);

// Look straight down at the board.
const targets = iwsdk('find the board', ['xr', 'list-targets']);
let core;
try {
  core = JSON.parse(targets).data.result.targets.find((t) => t.name === 'energy-core');
} catch { /* handled below */ }
if (!core) {
  console.log('\nThe board was not found. Check the browser console.');
  process.exit(1);
}
const x = core.position.x;
const y = core.position.y;
const z = core.position.z - 0.15;
iwsdk('move head above the board', ['xr', 'set-transform'], {
  device: 'headset', position: { x, y: y + 0.55, z: z + 0.05 },
});
iwsdk('look straight down', ['xr', 'look-at'], { device: 'headset', target: { x, y, z } });
await wait(1);
screenshot('move-0-start');

press('1', 'key 1: squad -> relay by the SHORT route');
await wait(4);
screenshot('move-1-short-halfway');
await wait(6);
screenshot('move-2-short-arrived');

press('0', 'key 0: squad -> home');
await wait(9);
press('2', 'key 2: try the LONG route while it is closed (should be refused)');
await wait(1);
press('3', 'key 3: restore the East Relay (spends 4 Energy)');
await wait(1);
press('2', 'key 2: squad -> relay by the LONG route');
await wait(11);
screenshot('move-3-long-halfway');
await wait(12);
screenshot('move-4-long-arrived');

const logs = iwsdk('collect logs', ['browser', 'logs'], { count: 200 });
writeFileSync(join(outDir, 'movement-log-raw.json'), logs);
let lines = [];
try {
  const parsed = JSON.parse(logs);
  const entries = parsed?.data?.result ?? parsed?.result ?? [];
  lines = entries
    .map((entry) => entry.message ?? '')
    .filter((message) => /^\[(units|resources|debug|placement|level)\]/.test(message));
} catch {
  lines = ['(could not read the log - see movement-log-raw.json)'];
}
writeFileSync(join(outDir, 'movement-log.txt'), lines.join('\n'));
console.log('\nGame log:');
for (const line of lines) console.log('  ' + line);
console.log(`\nDone. Screenshots saved in ${outDir}`);
