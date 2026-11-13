/**
 * Close-up screenshots of the board (T19 check).
 *
 * Enters XR in the managed emulator window, waits for the board to be built,
 * then moves the emulated head above the board and takes two screenshots:
 * a seated view and a top-down view. Saved to .iwsdk/test-results/.
 *
 * Run (with `npm run dev` already running in another terminal):
 *   node scripts/view-board.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
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

await waitUntilReady('waiting for the emulator window');
iwsdk('reload the game page', ['browser', 'reload']);
await wait(2);
await waitUntilReady('waiting for the page to load');
await wait(2);
iwsdk('enter XR', ['xr', 'enter']);
await wait(4);
iwsdk('switch to hand tracking', ['xr', 'set-input-mode'], { mode: 'hand' });

const targets = iwsdk('find the board', ['xr', 'list-targets']);
let board;
try {
  // Only grabbable things are listed, so find the energy core: it sits on
  // the near edge of the board, about 15 cm in front of the board centre.
  board = JSON.parse(targets).data.result.targets.find((t) => t.name === 'energy-core');
} catch { /* handled below */ }
if (!board) {
  console.log('\nThe board (energy-core) was not found. Check the browser console for [level] / [placement] logs.');
  process.exit(1);
}
const { x, y } = board.position;
const z = board.position.z - 0.15; // board centre is ~15 cm further away than the core
console.log(`  board centre at x=${x.toFixed(2)} y=${y.toFixed(2)} z=${z.toFixed(2)}`);

// Seated view: 45 cm above the board, 40 cm back towards the start position.
iwsdk('move head to a seated view', ['xr', 'set-transform'], {
  device: 'headset', position: { x, y: y + 0.45, z: z + 0.4 },
});
iwsdk('look at the board', ['xr', 'look-at'], { device: 'headset', target: { x, y, z } });
await wait(1);
screenshot('board-seated');

// Top-down view.
iwsdk('move head above the board', ['xr', 'set-transform'], {
  device: 'headset', position: { x, y: y + 0.55, z: z + 0.05 },
});
iwsdk('look straight down', ['xr', 'look-at'], { device: 'headset', target: { x, y, z } });
await wait(1);
screenshot('board-top');
console.log(`\nDone. Screenshots saved in ${outDir}`);
