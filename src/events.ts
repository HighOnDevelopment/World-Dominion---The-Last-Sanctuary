/**
 * Typed event bus (T06).
 *
 * Every game system talks to the others ONLY through these events, so the
 * three of us can build our systems separately and they still fit together.
 *
 * Usage:
 *   import { events } from './events.js';
 *   const stop = events.on('socketFilled', ({ socketId }) => { ... });
 *   events.emit('socketFilled', { socketId: 'relay-1' });
 *   stop(); // unsubscribe
 *
 * Positions are always in board-local coordinates (see src/README.md).
 */

export type ResourceKind = 'survivors' | 'energy' | 'materials';
export type MissionState = 'intro' | 'playing' | 'won' | 'lost';
export type BoardPlacementSource = 'table-mesh' | 'table-plane' | 'fallback' | 'desktop';
export type RouteChoice = 'short' | 'long';
export type RelayId = 'mainRelay' | 'eastRelay';
export type Team = 'squad' | 'civilian' | 'invader';

/** Every event in the game and the data it carries. Add new ones here. */
export interface GameEvents {
  /** P1: player pinched a unit or squad (null = selection cleared). */
  unitSelected: { unitId: string | null };
  /**
   * P1: player chose where the selected unit should go (board-local x, z).
   * unitId 'squad' moves the restorer and both sentinels together.
   * route forces the short or long route; omit it for the shortest open path.
   */
  destinationChosen: { unitId: string; x: number; z: number; route?: RouteChoice };
  /** P1: a unit reached the end of its path (board-local x, z). */
  unitArrived: { unitId: string; x: number; z: number };
  /** P3: a relay was restored (main relay = core plugged in; east relay = paid for). */
  relayRestored: { relayId: RelayId };
  /** P3: a unit or invader lost health. */
  unitDamaged: { unitId: string; health: number; maxHealth: number; attackerId: string };
  /** P3: a unit or invader was killed (it is hidden and stops moving). */
  unitDied: { unitId: string; team: Team };
  /** P3: an energy core was snapped into a relay socket. */
  socketFilled: { socketId: string };
  /** P1: a resource changed. `value` is the new total. */
  resourceChanged: { resource: ResourceKind; value: number; delta: number };
  /** P3: the mission moved to a new state. */
  missionStateChanged: { state: MissionState };
  /** P2: the board was placed (or re-placed) in the room. */
  boardPlaced: { source: BoardPlacementSource; tableHeightM: number };
}

type Handler<T> = (payload: T) => void;

class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  /** Listen for an event. Returns a function that stops listening. */
  on<K extends keyof E>(name: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(name, handler);
  }

  /** Listen for the next occurrence only. */
  once<K extends keyof E>(name: K, handler: Handler<E[K]>): () => void {
    const stop = this.on(name, (payload) => {
      stop();
      handler(payload);
    });
    return stop;
  }

  off<K extends keyof E>(name: K, handler: Handler<E[K]>): void {
    this.handlers.get(name)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<E[K]>)(payload);
      } catch (error) {
        console.error(`[events] handler for "${String(name)}" failed`, error);
      }
    }
  }
}

export const events = new EventBus<GameEvents>();
