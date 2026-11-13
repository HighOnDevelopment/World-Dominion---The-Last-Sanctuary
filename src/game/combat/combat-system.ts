/**
 * Combat (T24, P3 Utkarsh).
 *
 * - Gives every unit and invader its health from src/data/mission.ts.
 * - Sentinels automatically hit the nearest invader in range.
 * - Anything hit flashes red; anything killed is hidden.
 * Invaders attack in the enemy AI system (T23).
 */
import { createSystem, Mesh, MeshStandardMaterial, Object3D } from '@iwsdk/core';
import { INVADER_STATS, INVADERS, SQUAD, SURVIVORS, UNIT_STATS } from '../../data/mission.js';
import { events } from '../../events.js';
import { level } from '../../level/level-state.js';
import { health } from './health.js';

const FLASH_SECONDS = 0.15;
const FLASH_COLOR = 0xff1744;

/** The board-local object for a unit or invader id. */
export function objectOf(id: string): Object3D | undefined {
  return (level.units.get(id) ?? level.invaders.get(id))?.object3D;
}

export function boardDistance(a: Object3D, b: Object3D): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

export class CombatSystem extends createSystem({}) {
  private started = false;
  private elapsed = 0;
  /** Next time (seconds) each sentinel may attack. */
  private readonly nextAttack = new Map<string, number>();
  /** When each flashing object should return to its normal colour. */
  private readonly flashes = new Map<MeshStandardMaterial, { until: number; color: number }>();

  init(): void {
    this.cleanupFuncs.push(
      events.on('boardPlaced', () => this.start()),
      events.on('unitDamaged', ({ unitId, health: hp, maxHealth, attackerId }) => {
        console.info(`[combat] ${attackerId} hits ${unitId} (${hp}/${maxHealth})`);
        this.flash(unitId);
      }),
      events.on('unitDied', ({ unitId }) => {
        console.info(`[combat] ${unitId} died`);
        const object = objectOf(unitId);
        if (object) object.visible = false;
      }),
    );
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    for (const unit of [...SQUAD, ...SURVIVORS]) {
      health.register(unit.id, UNIT_STATS[unit.role].health, unit.role === 'civilian' ? 'civilian' : 'squad');
    }
    for (const invader of INVADERS) health.register(invader.id, INVADER_STATS.health, 'invader');
  }

  private flash(id: string): void {
    const object = objectOf(id);
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const existing = this.flashes.get(material);
    this.flashes.set(material, {
      until: this.elapsed + FLASH_SECONDS,
      color: existing?.color ?? material.emissive.getHex(),
    });
    material.emissive.setHex(FLASH_COLOR);
  }

  update(delta: number): void {
    this.elapsed += delta;

    for (const [material, flash] of this.flashes) {
      if (this.elapsed >= flash.until) {
        material.emissive.setHex(flash.color);
        this.flashes.delete(material);
      }
    }

    // Sentinels shoot the nearest invader in range.
    for (const unit of SQUAD) {
      const stats = UNIT_STATS[unit.role];
      if (stats.attackDamage <= 0 || !health.isAlive(unit.id)) continue;
      if ((this.nextAttack.get(unit.id) ?? 0) > this.elapsed) continue;
      const self = objectOf(unit.id);
      if (!self) continue;
      let target: string | null = null;
      let best: number = stats.attackRange;
      for (const invaderId of health.alive('invader')) {
        const other = objectOf(invaderId);
        if (!other) continue;
        const d = boardDistance(self, other);
        if (d <= best) {
          best = d;
          target = invaderId;
        }
      }
      if (target) {
        this.nextAttack.set(unit.id, this.elapsed + stats.attackIntervalS);
        health.damage(target, stats.attackDamage, unit.id);
      }
    }
  }
}
