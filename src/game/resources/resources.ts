/**
 * Resources: Survivors, Energy, Materials (T16, P1 Kartik).
 *
 * Plain TypeScript, no three.js, so it can be unit-tested. Every change is
 * announced with the `resourceChanged` event (the HUD and mission listen).
 *
 *   import { resources } from '../resources/resources.js';
 *   if (resources.spend('energy', 4)) { ... }   // false if not enough
 *   resources.add('materials', 2);
 */
import { RESOURCES } from '../../data/mission.js';
import { events, type ResourceKind } from '../../events.js';

class ResourceStore {
  private values: Record<ResourceKind, number> = {
    survivors: 0,
    energy: 0,
    materials: 0,
  };

  get(kind: ResourceKind): number {
    return this.values[kind];
  }

  /** Add (or with a negative number, remove) an amount. Never goes below 0. */
  add(kind: ResourceKind, delta: number): void {
    const value = Math.max(0, this.values[kind] + delta);
    const actual = value - this.values[kind];
    if (actual === 0) return;
    this.values[kind] = value;
    events.emit('resourceChanged', { resource: kind, value, delta: actual });
  }

  /** Spend an amount if there is enough. Returns false (and changes nothing) if not. */
  spend(kind: ResourceKind, amount: number): boolean {
    if (this.values[kind] < amount) return false;
    this.add(kind, -amount);
    return true;
  }

  /** Back to the mission's starting values (announces all three). */
  reset(): void {
    const start: Record<ResourceKind, number> = {
      survivors: RESOURCES.startSurvivors,
      energy: RESOURCES.startEnergy,
      materials: RESOURCES.startMaterials,
    };
    for (const kind of Object.keys(start) as ResourceKind[]) {
      const delta = start[kind] - this.values[kind];
      this.values[kind] = start[kind];
      events.emit('resourceChanged', { resource: kind, value: start[kind], delta });
    }
  }
}

export const resources = new ResourceStore();
