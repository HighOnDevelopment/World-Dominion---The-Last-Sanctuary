/**
 * Relay socket (T25, P3 Utkarsh).
 *
 * The player pinches the energy core and lets go of it on top of the broken
 * main relay. If the Restorer is standing at the relay, the core snaps into
 * the socket, locks in place and the relay is restored (`relayRestored`).
 * If the Restorer is not there, the core floats back to its start.
 * Let go anywhere else on the board and the core settles onto the board.
 */
import { createSystem, Grabbed, OneHandGrabbable, Vector3 } from '@iwsdk/core';
import {
  BOARD,
  CORE_RADIUS,
  CORE_START,
  LOCATIONS,
  MISSION_RANGES,
  RELAY_HEIGHT,
  WAYPOINTS,
} from '../../data/mission.js';
import { events } from '../../events.js';
import { level } from '../../level/level-state.js';
import { health } from '../combat/health.js';
import { boardLocalOf, setBoardLocal } from './board-space.js';

export class RelaySocketSystem extends createSystem({}) {
  private inserted = false;
  private wasGrabbed = false;
  private readonly local = new Vector3();

  init(): void {
    this.cleanupFuncs.push(events.on('missionReset', () => this.reset()));
  }

  private reset(): void {
    this.inserted = false;
    this.wasGrabbed = false;
    const core = level.energyCore;
    if (!core?.object3D) return;
    if (!core.hasComponent(OneHandGrabbable)) core.addComponent(OneHandGrabbable);
    setBoardLocal(core.object3D, CORE_START[0], CORE_RADIUS, CORE_START[1]);
  }

  private restorerAtRelay(): boolean {
    const restorer = level.units.get('restorer')?.object3D;
    if (!restorer || !health.isAlive('restorer')) return false;
    const [rx, rz] = WAYPOINTS.relay;
    return Math.hypot(restorer.position.x - rx, restorer.position.z - rz) <= MISSION_RANGES.atRelay;
  }

  update(): void {
    const core = level.energyCore;
    const object = core?.object3D;
    if (!core || !object || this.inserted) return;

    const grabbed = core.hasComponent(Grabbed);
    const justReleased = this.wasGrabbed && !grabbed;
    this.wasGrabbed = grabbed;
    if (grabbed) return;

    const p = boardLocalOf(object, this.local);
    const [sx, sz] = LOCATIONS.mainRelay;
    const nearSocket =
      Math.hypot(p.x - sx, p.z - sz) <= MISSION_RANGES.socketSnap &&
      p.y > RELAY_HEIGHT * 0.5 &&
      p.y < RELAY_HEIGHT + 0.08;

    if (nearSocket) {
      if (!this.restorerAtRelay()) {
        console.warn('[mission] The Restorer must be at the relay to install the core.');
        setBoardLocal(object, CORE_START[0], CORE_RADIUS, CORE_START[1]);
        return;
      }
      setBoardLocal(object, sx, RELAY_HEIGHT + CORE_RADIUS, sz);
      core.removeComponent(OneHandGrabbable);
      this.inserted = true;
      console.info('[mission] Energy core installed - main relay restored');
      events.emit('relayRestored', { relayId: 'mainRelay' });
      return;
    }

    if (justReleased) {
      const onBoard = Math.abs(p.x) <= BOARD.width / 2 && Math.abs(p.z) <= BOARD.depth / 2;
      if (onBoard) setBoardLocal(object, p.x, CORE_RADIUS, p.z);
      else setBoardLocal(object, CORE_START[0], CORE_RADIUS, CORE_START[1]);
    }
  }
}
