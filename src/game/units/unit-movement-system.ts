/**
 * Unit movement (T14, P1 Kartik).
 *
 * Listens for `destinationChosen` and walks units along the waypoint graph
 * at their speed from src/data/mission.ts, turning to face where they walk.
 * unitId 'squad' moves the restorer and both sentinels in a small formation.
 * Announces `unitArrived` when a unit reaches the end of its path.
 */
import { createSystem } from '@iwsdk/core';
import { SQUAD, SURVIVORS, UNIT_STATS, type UnitRole, type Vec2 } from '../../data/mission.js';
import { events, type RelayId, type RouteChoice } from '../../events.js';
import { level } from '../../level/level-state.js';
import { planRoute } from './waypoint-graph.js';

/** Units that move with 'squad', and their offset from the squad's target. */
const SQUAD_FORMATION: Record<string, Vec2> = {
  restorer: [0, 0],
  'sentinel-1': [-0.02, 0.015],
  'sentinel-2': [0.02, 0.015],
};

const ROLE_BY_ID = new Map<string, UnitRole>(
  [...SQUAD, ...SURVIVORS].map((unit) => [unit.id, unit.role]),
);

interface Walk {
  points: Vec2[];
  next: number;
  speed: number;
}

export class UnitMovementSystem extends createSystem({}) {
  private readonly walks = new Map<string, Walk>();
  private readonly restoredRelays = new Set<RelayId>();

  init(): void {
    this.cleanupFuncs.push(
      events.on('relayRestored', ({ relayId }) => {
        this.restoredRelays.add(relayId);
      }),
      events.on('destinationChosen', ({ unitId, x, z, route }) => {
        if (unitId === 'squad') {
          for (const [id, [ox, oz]] of Object.entries(SQUAD_FORMATION)) {
            this.sendUnit(id, [x + ox, z + oz], route);
          }
        } else {
          this.sendUnit(unitId, [x, z], route);
        }
      }),
    );
  }

  /** Plan a route for one unit. Returns false if it cannot go there. */
  sendUnit(unitId: string, destination: Vec2, route?: RouteChoice): boolean {
    const object = level.units.get(unitId)?.object3D;
    const role = ROLE_BY_ID.get(unitId);
    if (!object || !role) {
      console.warn(`[units] unknown unit "${unitId}"`);
      return false;
    }
    const speed = UNIT_STATS[role].speed;
    if (speed <= 0) return false; // the Keeper stays home
    const points = planRoute(
      [object.position.x, object.position.z],
      destination,
      { restoredRelays: this.restoredRelays, route },
    );
    if (!points) {
      console.warn(
        `[units] ${unitId} cannot reach (${destination[0].toFixed(2)}, ${destination[1].toFixed(2)})` +
          (route ? ` by the ${route} route` : '') +
          ' - is the route closed?',
      );
      return false;
    }
    this.walks.set(unitId, { points, next: 0, speed });
    return true;
  }

  update(delta: number): void {
    for (const [unitId, walk] of this.walks) {
      const object = level.units.get(unitId)?.object3D;
      if (!object) {
        this.walks.delete(unitId);
        continue;
      }
      let budget = walk.speed * delta;
      while (budget > 0 && walk.next < walk.points.length) {
        const [tx, tz] = walk.points[walk.next];
        const dx = tx - object.position.x;
        const dz = tz - object.position.z;
        const remaining = Math.hypot(dx, dz);
        if (remaining > 1e-6) object.rotation.y = Math.atan2(dx, dz);
        if (remaining <= budget) {
          object.position.x = tx;
          object.position.z = tz;
          budget -= remaining;
          walk.next += 1;
        } else {
          object.position.x += (dx / remaining) * budget;
          object.position.z += (dz / remaining) * budget;
          budget = 0;
        }
      }
      if (walk.next >= walk.points.length) {
        this.walks.delete(unitId);
        console.info(
          `[units] ${unitId} arrived at (${object.position.x.toFixed(2)}, ${object.position.z.toFixed(2)})`,
        );
        events.emit('unitArrived', { unitId, x: object.position.x, z: object.position.z });
      }
    }
  }
}
