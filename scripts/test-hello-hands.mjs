/**
 * Automated "hello hands" test (T09).
 *
 * Drives the IWER emulator in the managed browser opened by `npm run dev`:
 * enters XR, switches to hand tracking, reaches out with the right hand,
 * pinches the orange cube, lifts it in front of the face and lets go.
 * Screenshots and results are saved to .iwsdk/test-results/ (not committed).
 *
 * Run (with `npm run dev` already running in another terminal):
 *   node scripts/test-hello-hands.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cli = join('node_modules', '@iwsdk', 'cli', 'dist', 'cli.js');
const outDir = join('.iwsdk', 'test-results');
mkdirSync(outDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), steps: [] };

function iwsdk(label, args, input = {}) {
  process.stdout.write(`- ${label} ... `);
  let text = '';
  let ok = true;
  try {
    text = execFileSync(
      process.execPath,
      [cli, ...args, '--input-json', JSON.stringify(input), '--timeout', '60000'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 },
    );
  } catch (error) {
    ok = false;
    text = `${error.stdout ?? ''}${error.stderr ?? ''}` || String(error);
  }
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  report.steps.push({ label, args, input, ok, data });
  console.log(ok ? 'ok' : 'FAILED');
  return { ok, data, text };
}

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** Poll until the managed browser answers (it may still be launching). */
async function waitUntilReady(label, maxSeconds = 90) {
  process.stdout.write(`- ${label} `);
  for (let i = 0; i < maxSeconds / 3; i++) {
    try {
      const text = execFileSync(
        process.execPath,
        [cli, 'xr', 'status', '--input-json', '{}', '--timeout', '10000'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 },
      );
      if (/"ok"\s*:\s*true/.test(text)) {
        console.log(' ready');
        return true;
      }
    } catch {
      /* not ready yet */
    }
    process.stdout.write('.');
    await wait(3);
  }
  console.log(' gave up');
  return false;
}

function saveScreenshot(name) {
  const shot = iwsdk(`screenshot (${name})`, ['browser', 'screenshot']);
  const match = shot.text.match(/"screenshotPath"\s*:\s*"([^"]+)"/);
  if (match) {
    const src = JSON.parse(`"${match[1]}"`);
    if (existsSync(src)) copyFileSync(src, join(outDir, `${name}.png`));
  }
}

function finish() {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'hello-hands.json'), JSON.stringify(report, null, 2));
  console.log(`\nDone. Results saved in ${outDir}`);
}

await waitUntilReady('waiting for the emulator window');
iwsdk('reload the game page', ['browser', 'reload']);
await wait(2);
await waitUntilReady('waiting for the page to load');
await wait(2);
iwsdk('enter XR', ['xr', 'enter']);
await wait(4); // the table search waits ~1.5 s after entering XR
iwsdk('switch to hand tracking', ['xr', 'set-input-mode'], { mode: 'hand' });
await wait(1);
const targets = iwsdk('list grabbable targets', ['xr', 'list-targets']);
if (!targets.text.includes('energy-core')) {
  console.log('\nThe energy-core was not found in the scene. Check the browser console.');
  saveScreenshot('no-cube');
  finish();
  process.exit(1);
}
saveScreenshot('1-before-grab');

iwsdk('reach, pinch the energy core and lift it', ['xr', 'run-sequence'], {
  device: 'hand-right',
  steps: [
    { label: 'grab energy core', target: 'energy-core', approach: { distance: 0.06 }, pinch: { value: 1, at: 'arrival' } },
    { label: 'lift in front of face', position: { relativeTo: 'head', x: 0.08, y: -0.2, z: -0.35 } },
    { label: 'hold', duration: 1 },
  ],
});
saveScreenshot('2-holding-cube');

iwsdk('let go', ['xr', 'run-sequence'], {
  device: 'hand-right',
  steps: [{ label: 'release', pinch: 0, duration: 0.2 }, { label: 'wait', duration: 0.5 }],
});
saveScreenshot('3-after-release');
iwsdk('placement log', ['browser', 'logs'], { pattern: 'placement' });
finish();
