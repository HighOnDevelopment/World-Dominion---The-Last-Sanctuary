/**
 * Escort (T27, P3 Utkarsh).
 *
 * Once the main relay is restored, the civilians at the camp join the squad
 * and follow the Restorer (or a Sentinel if the Restorer has fallen), using
 * the same route the squad last took. A civilian that reaches the Sanctuary
 * is rescued (`survivorRescued`).
 */
import { createSystem } from '@iwsdk/core';
import { MISSION_RANGES, SURVIVORS, WAYPOINTS, type Vec2 } from '../../data/mission.js';
import { events, type RouteChoice } from '../../events.js';
import { level } from '../../level/level-state.js';
import { health } from '../combat/health.js';

const REPLAN_SECONDS = 0.5;
/** How far behind the leader civilians stop. */
const FOLLOW_DISTANCE = 0.03;
/**
 * Each civilian keeps to a slightly different side (radians) so they do
 * not stack on one point. They always stay on the side they approach from,
 * so they never walk past the leader into danger.
 */
const SPREAD: Record<string, number> = {
  'civilian-1': 0,
  'civilian-2': 0.45,
  'civilian-3': -0.45,
};
/** Where rescued civilians wait, beside the Sanctuary. */
const HOME_SPOTS: Record<string, Vec2> = {
  'civilian-1': [-0.07, 0.1],
  'civilian-2': [-0.07, 0.13],
  'civilian-3': [-0.1, 0.115],
};

export class EscortSystem extends createSystem({}) {
  private readonly following = new Set<string>();
  private readonly rescued = new Set<string>();
  private readonly lastOrder = new Map<string, Vec2>();
  private squadRoute: RouteChoice | undefined;
  private sinceReplan = 0;

  init(): void {
    this.cleanupFuncs.push(
      events.on('destinationChosen', ({ unitId, route }) => {
        if (unitId === 'squad') this.squadRoute = route;
      }),
      events.on('relayRestored', ({ relayId }) => {
        if (relayId !== 'mainRelay') return;
        for (const civilian of SURVIVORS) {
          if (health.isAlive(civilian.id)) this.following.add(civilian.id);
        }
        console.info(`[mission] ${this.following.size} survivor(s) joined the squad`);
      }),
      events.on('unitDied', ({ unitId }) => {
        this.following.delete(unitId);
      }),
      events.on('missionReset', () => {
        this.following.clear();
        this.rescued.clear();
        this.lastOrder.clear();
        this.squadRoute = undefined;
      }),
    );
  }

  /** The unit civilians follow: the Restorer, or a surviving Sentinel. */
  private leader() {
    for (const id of ['restorer', 'sentinel-1', 'sentinel-2']) {
      if (health.isAlive(id)) return level.units.get(id)?.object3D;
    }
    return undefined;
  }

  update(delta: number): void {
    if (this.following.size === 0) return;
    const [hx, hz] = WAYPOINTS.sanctuary;

    // Rescue anyone who made it home.
    for (const id of [...this.following]) {
      const civilian = level.units.get(id)?.object3D;
      if (!civilian) continue;
      if (Math.hypot(civilian.position.x - hx, civilian.position.z - hz) <= MISSION_RANGES.atHome) {
        this.following.delete(id);
        this.rescued.add(id);
        const [sx, sz] = HOME_SPOTS[id] ?? [hx, hz];
        events.emit('destinationChosen', { unitId: id, x: sx, z: sz });
        console.info(`[mission] ${id} rescued (${this.rescued.size})`);
        events.emit('survivorRescued', { unitId: id, rescued: this.rescued.size });
      }
    }

    this.sinceReplan += delta;
    if (this.sinceReplan < REPLAN_SECONDS) return;
    this.sinceReplan = 0;

    const leader = this.leader();
    if (!leader) return;
    for (const id of this.following) {
      const civilian = level.units.get(id)?.object3D;
      if (!civilian) continue;
      // Stop FOLLOW_DISTANCE from the leader, on this civilian's own side.
      let dx = civilian.position.x - leader.position.x;
      let dz = civilian.position.z - leader.position.z;
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      const angle = SPREAD[id] ?? 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const target: Vec2 = [
        leader.position.x + (dx * cos - dz * sin) * FOLLOW_DISTANCE,
        leader.position.z + (dx * sin + dz * cos) * FOLLOW_DISTANCE,
      ];
      const gap = Math.hypot(civilian.position.x - target[0], civilian.position.z - target[1]);
      const previous = this.lastOrder.get(id);
      const moved = previous ? Math.hypot(previous[0] - target[0], previous[1] - target[1]) : Infinity;
      if (gap > MISSION_RANGES.escortFollow && moved > 0.015) {
        this.lastOrder.set(id, target);
        events.emit('destinationChosen', { unitId: id, x: target[0], z: target[1], route: this.squadRoute });
      }
    }
  }
}
