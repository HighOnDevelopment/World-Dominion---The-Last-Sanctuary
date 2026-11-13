/**
 * Operation First Light: mission design (T10, P3 Utkarsh).
 *
 * This file IS the mission one-pager. Everything the game needs to know about
 * the first mission lives here as typed data, so design and code never drift.
 * Tune numbers here, not inside systems.
 *
 * Board-local coordinates (see src/README.md): metres, origin at the centre
 * of the board's top surface, +X to the player's right, +Z towards the player.
 * The board is 0.6 m wide (X) and 0.4 m deep (Z).
 *
 * The story in one paragraph:
 *   Three civilians are trapped at the Survivor Camp beyond a broken energy
 *   relay. The player sends a squad (Restorer + two Sentinels) from the
 *   Sanctuary, restores the relay by plugging in an energy core, and escorts
 *   the survivors home. Two routes lead there: a SHORT route patrolled by
 *   Invaders, or a LONG, safe route that only opens once the East Relay is
 *   restored, which costs Energy. Bringing survivors home rebuilds the
 *   Archive, the first step of restoring the world.
 */

export type Vec2 = readonly [x: number, z: number];

// ---------------------------------------------------------------- board ---
export const BOARD = {
  width: 0.6,
  depth: 0.4,
  thickness: 0.015,
} as const;

// ------------------------------------------------------------ locations ---
export const LOCATIONS = {
  sanctuary: [0.0, 0.14],
  archive: [0.2, 0.13],
  mainRelay: [-0.12, -0.08],
  eastRelay: [0.2, -0.05],
  camp: [-0.21, -0.14],
} as const satisfies Record<string, Vec2>;

// --------------------------------------------------------- waypoint graph ---
/** Nodes units walk between. Units always move node to node along EDGES. */
export const WAYPOINTS = {
  sanctuary: [0.0, 0.11],
  short1: [-0.04, 0.05],
  short2: [-0.08, -0.02],
  long1: [0.12, 0.08],
  long2: [0.2, -0.02],
  long3: [0.06, -0.13],
  relay: [-0.1, -0.06],
  camp: [-0.18, -0.12],
} as const satisfies Record<string, Vec2>;

export type WaypointId = keyof typeof WAYPOINTS;

export interface Edge {
  from: WaypointId;
  to: WaypointId;
  route: 'short' | 'long' | 'shared';
  /** If set, the edge is closed until this relay is restored. */
  requiresRelay?: 'eastRelay';
}

export const EDGES: readonly Edge[] = [
  { from: 'sanctuary', to: 'short1', route: 'short' },
  { from: 'short1', to: 'short2', route: 'short' },
  { from: 'short2', to: 'relay', route: 'short' },
  { from: 'sanctuary', to: 'long1', route: 'long' },
  { from: 'long1', to: 'long2', route: 'long' },
  { from: 'long2', to: 'long3', route: 'long', requiresRelay: 'eastRelay' },
  { from: 'long3', to: 'relay', route: 'long' },
  { from: 'relay', to: 'camp', route: 'shared' },
];

// ---------------------------------------------------------------- units ---
export type UnitRole = 'keeper' | 'restorer' | 'sentinel' | 'civilian';

export interface UnitSpawn {
  id: string;
  role: UnitRole;
  at: Vec2;
}

export const UNIT_STATS = {
  keeper: { speed: 0, health: 1, attackRange: 0, attackDamage: 0 },
  restorer: { speed: 0.03, health: 3, attackRange: 0, attackDamage: 0 },
  sentinel: { speed: 0.03, health: 5, attackRange: 0.05, attackDamage: 1 },
  civilian: { speed: 0.025, health: 2, attackRange: 0, attackDamage: 0 },
} as const satisfies Record<UnitRole, { speed: number; health: number; attackRange: number; attackDamage: number }>;

export const SQUAD: readonly UnitSpawn[] = [
  { id: 'keeper', role: 'keeper', at: [-0.04, 0.16] },
  { id: 'restorer', role: 'restorer', at: [0.0, 0.09] },
  { id: 'sentinel-1', role: 'sentinel', at: [-0.03, 0.09] },
  { id: 'sentinel-2', role: 'sentinel', at: [0.03, 0.09] },
];

export const SURVIVORS: readonly UnitSpawn[] = [
  { id: 'civilian-1', role: 'civilian', at: [-0.23, -0.12] },
  { id: 'civilian-2', role: 'civilian', at: [-0.2, -0.16] },
  { id: 'civilian-3', role: 'civilian', at: [-0.24, -0.16] },
];

// ------------------------------------------------------------- invaders ---
export const INVADER_STATS = {
  patrolSpeed: 0.02,
  chaseSpeed: 0.035,
  detectRadius: 0.06,
  /** Give up the chase this far from the patrol path. */
  leashRadius: 0.12,
  attackRange: 0.03,
  attackDamage: 1,
  attackIntervalS: 1.2,
  health: 3,
} as const;

export interface InvaderSpawn {
  id: string;
  /** Loop of points the invader patrols. */
  patrol: readonly Vec2[];
}

/** Both invaders guard the SHORT route. The long route is safe. */
export const INVADERS: readonly InvaderSpawn[] = [
  { id: 'invader-1', patrol: [[-0.02, 0.04], [-0.09, 0.03], [-0.07, -0.03]] },
  { id: 'invader-2', patrol: [[-0.1, -0.02], [-0.03, -0.06], [-0.06, 0.01]] },
];

// ------------------------------------------------------------ resources ---
export const RESOURCES = {
  startEnergy: 10,
  startMaterials: 0,
  startSurvivors: 0,
  /** Energy to restore the East Relay and open the long route. */
  eastRelayCost: 4,
  /** Energy for one guardian shield (stretch, T42). */
  shieldCost: 3,
  /** Materials earned per survivor brought home. */
  materialsPerSurvivor: 2,
} as const;

// -------------------------------------------------------------- mission ---
export const MISSION = {
  timeLimitS: 6 * 60,
  survivorsTotal: SURVIVORS.length,
  /** Win when at least this many survivors reach the Sanctuary. */
  survivorsToWin: 2,
  /** Lose if fewer than this many survivors are still alive. */
  /** (equivalently: losing 2 of 3 civilians is a loss) */
  minSurvivorsAlive: 2,
} as const;

/** Archive restoration stages unlocked by Materials (T34). */
export const ARCHIVE_STAGES = [
  { percent: 0, materials: 0 },
  { percent: 25, materials: 2 },
  { percent: 50, materials: 4 },
] as const;
