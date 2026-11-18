/**
 * Mission flow (T26, P3 Utkarsh).
 *
 * Operation First Light, step by step:
 *   1. Lead the squad to the broken relay
 *   2. Plug the energy core into the relay
 *   3. Escort the survivors home
 * Win: MISSION.survivorsToWin civilians reach the Sanctuary.
 * Lose: the Restorer falls before the relay is restored, too many survivors
 *       die to still win, or the timer runs out.
 * Restart: `missionReset` puts everything back without reloading the page.
 */
import { createSystem } from '@iwsdk/core';
import { MISSION, MISSION_RANGES, RESOURCES, SURVIVORS, WAYPOINTS } from '../../data/mission.js';
import { events, type MissionState } from '../../events.js';
import { level } from '../../level/level-state.js';
import { health } from '../combat/health.js';
import { resources } from '../resources/resources.js';

const OBJECTIVES = [
  '',
  'Lead the squad to the broken relay',
  'Plug the energy core into the relay',
  'Escort the survivors home',
] as const;

export class MissionSystem extends createSystem({}) {
  private state: MissionState = 'intro';
  private step = 0;
  private remaining: number = MISSION.timeLimitS;
  private lastWholeSecond = -1;
  private relayRestored = false;
  private rescued = 0;

  init(): void {
    this.cleanupFuncs.push(
      events.on('boardPlaced', () => {
        if (this.state === 'intro') this.start();
      }),
      events.on('missionReset', () => this.start()),
      events.on('relayRestored', ({ relayId }) => {
        if (relayId !== 'mainRelay' || this.state !== 'playing') return;
        this.relayRestored = true;
        this.setStep(3);
      }),
      events.on('survivorRescued', () => {
        if (this.state !== 'playing') return;
        this.rescued += 1;
        resources.add('survivors', 1);
        resources.add('materials', RESOURCES.materialsPerSurvivor);
        if (this.rescued >= MISSION.survivorsToWin) {
          this.finish('won', `${this.rescued} survivors reached the Sanctuary`);
        }
      }),
    );
  }

  private start(): void {
    this.remaining = MISSION.timeLimitS;
    this.lastWholeSecond = -1;
    this.relayRestored = false;
    this.rescued = 0;
    this.setState('playing');
    this.setStep(1);
  }

  private setState(state: MissionState, reason?: string): void {
    this.state = state;
    console.info(`[mission] state: ${state}${reason ? ` - ${reason}` : ''}`);
    events.emit('missionStateChanged', { state, reason });
  }

  private setStep(step: number): void {
    if (step === this.step && step !== 1) return;
    this.step = step;
    const text = OBJECTIVES[step] ?? '';
    console.info(`[mission] objective ${step}: ${text}`);
    events.emit('objectiveChanged', { step, text });
  }

  private finish(state: 'won' | 'lost', reason: string): void {
    if (this.state !== 'playing') return;
    this.setState(state, reason);
  }

  update(delta: number): void {
    if (this.state !== 'playing') return;

    this.remaining = Math.max(0, this.remaining - delta);
    const whole = Math.ceil(this.remaining);
    if (whole !== this.lastWholeSecond) {
      this.lastWholeSecond = whole;
      events.emit('missionTimer', { remainingS: whole });
    }

    // Step 1 -> 2: the Restorer reached the relay.
    if (this.step === 1) {
      const restorer = level.units.get('restorer')?.object3D;
      const [rx, rz] = WAYPOINTS.relay;
      if (
        restorer &&
        health.isAlive('restorer') &&
        Math.hypot(restorer.position.x - rx, restorer.position.z - rz) <= MISSION_RANGES.atRelay
      ) {
        this.setStep(2);
      }
    }

    // Losing conditions.
    if (!this.relayRestored && !health.isAlive('restorer')) {
      this.finish('lost', 'The Restorer fell before the relay was restored');
    } else if (
      SURVIVORS.filter((c) => health.isAlive(c.id)).length < MISSION.survivorsToWin
    ) {
      this.finish('lost', 'Too many survivors were lost');
    } else if (this.remaining <= 0) {
      this.finish('lost', 'Time ran out');
    }
  }
}
