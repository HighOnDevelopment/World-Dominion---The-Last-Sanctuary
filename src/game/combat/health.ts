/**
 * Health of every unit and invader (T24, P3 Utkarsh).
 *
 * Plain TypeScript, no three.js. Announces `unitDamaged` and `unitDied`.
 *   health.damage('restorer', 1, 'invader-1');
 *   health.isAlive('sentinel-1');
 */
import { events, type Team } from '../../events.js';

interface Record {
  hp: number;
  max: number;
  team: Team;
}

class HealthStore {
  private readonly records = new Map<string, Record>();

  register(id: string, max: number, team: Team): void {
    this.records.set(id, { hp: max, max, team });
  }

  clear(): void {
    this.records.clear();
  }

  isAlive(id: string): boolean {
    return (this.records.get(id)?.hp ?? 0) > 0;
  }

  teamOf(id: string): Team | undefined {
    return this.records.get(id)?.team;
  }

  /** Living ids, optionally only one team. */
  alive(team?: Team): string[] {
    const ids: string[] = [];
    for (const [id, record] of this.records) {
      if (record.hp > 0 && (!team || record.team === team)) ids.push(id);
    }
    return ids;
  }

  /** Apply damage. Returns true if this hit killed the target. */
  damage(id: string, amount: number, attackerId: string): boolean {
    const record = this.records.get(id);
    if (!record || record.hp <= 0) return false;
    record.hp = Math.max(0, record.hp - amount);
    events.emit('unitDamaged', { unitId: id, health: record.hp, maxHealth: record.max, attackerId });
    if (record.hp === 0) {
      events.emit('unitDied', { unitId: id, team: record.team });
      return true;
    }
    return false;
  }
}

export const health = new HealthStore();
