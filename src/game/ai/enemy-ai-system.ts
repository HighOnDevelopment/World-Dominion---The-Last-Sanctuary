/**
 * Enemy AI (T23, P3 Utkarsh).
 *
 * Each invader runs a small state machine:
 *   patrol  - walk its patrol loop from src/data/mission.ts
 *   chase   - a squad unit or civilian came within detectRadius: run at it
 *   attack  - (inside chase) target within attackRange: hit it every
 *             attackIntervalS seconds
 *   return  - target lost/dead, or dragged more than leashRadius from the
 *             patrol loop: walk back to the nearest patrol point
 */
import { createSystem, Object3D } from '@iwsdk/core';
import { INVADER_STATS, INVADERS, type InvaderSpawn, type Vec2 } from '../../data/mission.js';
import { boardDistance, objectOf } from '../combat/combat-system.js';
import { health } from '../combat/health.js';

type Mode = 'patrol' | 'chase' | 'return';

interface Brain {
  spawn: InvaderSpawn;
  mode: Mode;
  patrolIndex: number;
  target: string | null;
  nextAttack: number;
}

function distanceTo(object: Object3D, point: Vec2): number {
  return Math.hypot(object.position.x - point[0], object.position.z - point[1]);
}

/** Move `object` towards a board point; returns true when it got there. */
function stepTowards(object: Object3D, x: number, z: number, distance: number): boolean {
  const dx = x - object.position.x;
  const dz = z - object.position.z;
  const remaining = Math.hypot(dx, dz);
  if (remaining > 1e-6) object.rotation.y = Math.atan2(dx, dz);
  if (remaining <= distance) {
    object.position.x = x;
    object.position.z = z;
    return true;
  }
  object.position.x += (dx / remaining) * distance;
  object.position.z += (dz / remaining) * distance;
  return false;
}

export class EnemyAISystem extends createSystem({}) {
  private elapsed = 0;
  private readonly brains = new Map<string, Brain>(
    INVADERS.map((spawn) => [
      spawn.id,
      { spawn, mode: 'patrol' as Mode, patrolIndex: 1 % spawn.patrol.length, target: null, nextAttack: 0 },
    ]),
  );

  private setMode(id: string, brain: Brain, mode: Mode, target: string | null = null): void {
    if (brain.mode === mode && brain.target === target) return;
    brain.mode = mode;
    brain.target = target;
    console.info(`[ai] ${id} -> ${mode}${target ? ` ${target}` : ''}`);
  }

  /** Nearest living squad unit or civilian within the detect radius (not the Keeper). */
  private findTarget(self: Object3D): string | null {
    let best: string | null = null;
    let bestDistance: number = INVADER_STATS.detectRadius;
    for (const id of [...health.alive('squad'), ...health.alive('civilian')]) {
      if (id === 'keeper') continue;
      const other = objectOf(id);
      if (!other || !other.visible) continue;
      const d = boardDistance(self, other);
      if (d <= bestDistance) {
        bestDistance = d;
        best = id;
      }
    }
    return best;
  }

  private distanceFromPatrol(self: Object3D, brain: Brain): number {
    return Math.min(...brain.spawn.patrol.map((p) => distanceTo(self, p)));
  }

  update(delta: number): void {
    this.elapsed += delta;
    for (const [id, brain] of this.brains) {
      const self = objectOf(id);
      if (!self || !health.isAlive(id)) continue;

      if (brain.mode !== 'chase') {
        const target = this.findTarget(self);
        if (target && brain.mode === 'patrol') this.setMode(id, brain, 'chase', target);
      }

      if (brain.mode === 'patrol') {
        const point = brain.spawn.patrol[brain.patrolIndex];
        if (stepTowards(self, point[0], point[1], INVADER_STATS.patrolSpeed * delta)) {
          brain.patrolIndex = (brain.patrolIndex + 1) % brain.spawn.patrol.length;
        }
      } else if (brain.mode === 'chase') {
        const target = brain.target ? objectOf(brain.target) : undefined;
        const lost =
          !target ||
          !brain.target ||
          !health.isAlive(brain.target) ||
          this.distanceFromPatrol(self, brain) > INVADER_STATS.leashRadius;
        if (lost) {
          this.setMode(id, brain, 'return');
          continue;
        }
        const d = boardDistance(self, target);
        if (d > INVADER_STATS.attackRange) {
          stepTowards(self, target.position.x, target.position.z, INVADER_STATS.chaseSpeed * delta);
        } else if (this.elapsed >= brain.nextAttack) {
          brain.nextAttack = this.elapsed + INVADER_STATS.attackIntervalS;
          health.damage(brain.target!, INVADER_STATS.attackDamage, id);
        }
      } else {
        // Return to the nearest patrol point, then resume patrolling from there.
        let nearest = 0;
        brain.spawn.patrol.forEach((p, i) => {
          if (distanceTo(self, p) < distanceTo(self, brain.spawn.patrol[nearest])) nearest = i;
        });
        const point = brain.spawn.patrol[nearest];
        if (stepTowards(self, point[0], point[1], INVADER_STATS.patrolSpeed * delta)) {
          brain.patrolIndex = (nearest + 1) % brain.spawn.patrol.length;
          this.setMode(id, brain, 'patrol');
        }
      }
    }
  }
}
