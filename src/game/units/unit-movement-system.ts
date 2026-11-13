/**
 * Unit movement (T14, P1 Kartik).
 *
 * Listens for `destinationChosen` and walks units along the waypoint graph
 * at their speed from src/data/mission.ts, turning to face where they walk.
 * unitId 'squad' moves the restorer and both sentinels in a small formation.
 * Announces `unitArrived` when a unit reaches the end of its path.
 */
import { createSystem } from '@iwsdk/core';
import {
  SQUAD,
  SQUAD_FORMATION,
  SQUAD_HOME,
  SQUAD_START_DELAY_S,
  SURVIVORS,
  UNIT_STATS,
  type UnitRole,
  type Vec2,
} from '../../data/mission.js';
import { events, type RelayId, type RouteChoice } from '../../events.js';
import { level } from '../../level/level-state.js';
import { planRoute } from './waypoint-graph.js';

const ROLE_BY_ID = new Map<string, UnitRole>(
  [...SQUAD, ...SURVIVORS].map((unit) => [unit.id, unit.role]),
);

/**
 * Where each squad member should stand at a destination: the formation
 * turned to face the direction the squad travels (from the restorer).
 */
function squadSpots(destination: Vec2): [string, Vec2][] {
  // Going home: everyone returns to their own spot in front of the Sanctuary.
  if (Math.hypot(destination[0] - SQUAD_HOME[0], destination[1] - SQUAD_HOME[1]) < 0.01) {
    return SQUAD.filter((unit) => unit.id in SQUAD_FORMATION).map((unit) => [unit.id, unit.at]);
  }
  const from = level.units.get('restorer')?.object3D?.position;
  let fx = destination[0] - (from?.x ?? destination[0]);
  let fz = destination[1] - (from?.z ?? destination[1] + 1);
  const length = Math.hypot(fx, fz) || 1;
  fx /= length;
  fz /= length;
  // Right-hand vector when facing (fx, fz) seen from above, +Z towards player.
  const rx = -fz;
  const rz = fx;
  return Object.entries(SQUAD_FORMATION).map(([id, [right, forward]]) => [
    id,
    [destination[0] + rx * right + fx * forward, destination[1] + rz * right + fz * forward],
  ]);
}

interface Walk {
  points: Vec2[];
  next: number;
  speed: number;
  /** Time (seconds since start) when the unit starts walking. */
  startAt: number;
}

export class UnitMovementSystem extends createSystem({}) {
  private readonly walks = new Map<string, Walk>();
  private readonly restoredRelays = new Set<RelayId>();
  private readonly dead = new Set<string>();
  private elapsed = 0;

  init(): void {
    this.cleanupFuncs.push(
      events.on('relayRestored', ({ relayId }) => {
        this.restoredRelays.add(relayId);
      }),
      events.on('unitDied', ({ unitId }) => {
        this.dead.add(unitId);
        this.walks.delete(unitId);
      }),
      events.on('destinationChosen', ({ unitId, x, z, route }) => {
        if (unitId === 'squad') {
          for (const [id, spot] of squadSpots([x, z])) {
            this.sendUnit(id, spot, route, SQUAD_START_DELAY_S[id] ?? 0);
          }
        } else {
          this.sendUnit(unitId, [x, z], route);
        }
      }),
    );
  }

  /** Plan a route for one unit. Returns false if it cannot go there. */
  sendUnit(unitId: string, destination: Vec2, route?: RouteChoice, delayS = 0): boolean {
    if (this.dead.has(unitId)) return false;
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
    this.walks.set(unitId, { points, next: 0, speed, startAt: this.elapsed + delayS });
    return true;
  }

  update(delta: number): void {
    this.elapsed += delta;
    for (const [unitId, walk] of this.walks) {
      if (this.elapsed < walk.startAt) continue;
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
