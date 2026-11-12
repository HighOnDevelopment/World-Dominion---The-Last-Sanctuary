/**
 * Table finder (T09, P2 Ishan).
 *
 * Turns what scene understanding reports (labelled furniture meshes and flat
 * planes) into "table candidates" and picks the best one for the board.
 *
 * Heights are metres above the floor (IWSDK tracks from floor level).
 */
import { Box3, Object3D, Vector3 } from '@iwsdk/core';
import type { BoardPlacementSource } from '../events.js';

/** Lowest surface we accept. Coffee tables are often ~0.4 m high. */
export const TABLE_MIN_HEIGHT_M = 0.3;
/** Highest surface we accept (a tall counter). */
export const TABLE_MAX_HEIGHT_M = 1.2;
/** Smallest usable surface, both sides, in metres. */
export const TABLE_MIN_SIZE_M = 0.3;
/** Ignore surfaces further away than this from the player. */
export const TABLE_MAX_DISTANCE_M = 2.5;

export interface TableCandidate {
  source: Exclude<BoardPlacementSource, 'fallback'>;
  /** World-space centre of the table top. */
  center: Vector3;
  /** Height of the table top above the floor. */
  topY: number;
  /** Size of the table top in world X and Z (axis-aligned). */
  sizeX: number;
  sizeZ: number;
  /** True when the device itself labelled it as a table. */
  labelledTable: boolean;
  /** Horizontal distance from the player's head. */
  distance: number;
}

const corner = new Vector3();
const box = new Box3();

/** World-space box of a local-space min/max box attached to an object. */
function worldBoxFromLocal(
  object: Object3D,
  min: ArrayLike<number>,
  max: ArrayLike<number>,
): Box3 {
  object.updateWorldMatrix(true, false);
  box.makeEmpty();
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? max[0] : min[0],
      i & 2 ? max[1] : min[1],
      i & 4 ? max[2] : min[2],
    );
    box.expandByPoint(corner.applyMatrix4(object.matrixWorld));
  }
  return box;
}

function makeCandidate(
  source: TableCandidate['source'],
  worldBox: Box3,
  topY: number,
  labelledTable: boolean,
  head: Vector3,
): TableCandidate | null {
  const sizeX = worldBox.max.x - worldBox.min.x;
  const sizeZ = worldBox.max.z - worldBox.min.z;
  if (topY < TABLE_MIN_HEIGHT_M || topY > TABLE_MAX_HEIGHT_M) return null;
  if (sizeX < TABLE_MIN_SIZE_M || sizeZ < TABLE_MIN_SIZE_M) return null;
  const center = new Vector3(
    (worldBox.min.x + worldBox.max.x) / 2,
    topY,
    (worldBox.min.z + worldBox.max.z) / 2,
  );
  const distance = Math.hypot(center.x - head.x, center.z - head.z);
  if (distance > TABLE_MAX_DISTANCE_M) return null;
  return { source, center, topY, sizeX, sizeZ, labelledTable, distance };
}

/** Candidate from a bounded furniture mesh (e.g. semanticLabel "table"). */
export function candidateFromMesh(
  object: Object3D,
  min: ArrayLike<number>,
  max: ArrayLike<number>,
  semanticLabel: string,
  head: Vector3,
): TableCandidate | null {
  const label = semanticLabel.toLowerCase();
  const labelledTable = label.includes('table') || label.includes('desk');
  if (!labelledTable) return null; // other furniture (sofa, bed...) is not a table
  const worldBox = worldBoxFromLocal(object, min, max);
  return makeCandidate('table-mesh', worldBox, worldBox.max.y, true, head);
}

/** Minimal shape of a WebXR plane that we need. */
export interface PlaneLike {
  orientation?: string;
  semanticLabel?: string;
  polygon: ReadonlyArray<{ x: number; y: number; z: number }>;
}

/** Candidate from a horizontal plane at table height. */
export function candidateFromPlane(
  object: Object3D,
  plane: PlaneLike,
  head: Vector3,
): TableCandidate | null {
  if (plane.orientation && plane.orientation !== 'horizontal') return null;
  const label = (plane.semanticLabel ?? '').toLowerCase();
  if (label === 'floor' || label === 'ceiling') return null;
  if (plane.polygon.length < 3) return null;
  object.updateWorldMatrix(true, false);
  box.makeEmpty();
  for (const point of plane.polygon) {
    corner.set(point.x, point.y, point.z);
    box.expandByPoint(corner.applyMatrix4(object.matrixWorld));
  }
  const topY = (box.min.y + box.max.y) / 2;
  const labelledTable = label.includes('table') || label.includes('desk');
  return makeCandidate('table-plane', box, topY, labelledTable, head);
}

/**
 * How much a table behind the player counts against it, in metres of extra
 * distance. A table straight ahead adds 0; one directly behind adds this much.
 * The player sits facing their table, so "in front" matters more than "near".
 */
export const BEHIND_PENALTY_M = 2;

/** Lower is better: distance plus a penalty for not being in front. */
export function tableScore(
  candidate: TableCandidate,
  head: Vector3,
  forward: Vector3,
): number {
  const dx = candidate.center.x - head.x;
  const dz = candidate.center.z - head.z;
  const length = Math.hypot(dx, dz) || 1;
  const facing = (dx * forward.x + dz * forward.z) / length; // 1 ahead, -1 behind
  return candidate.distance + (BEHIND_PENALTY_M * (1 - facing)) / 2;
}

/**
 * Pick the best table: device-labelled tables first, then the best score
 * (near AND in front of the player). `forward` is the horizontal looking
 * direction of the player (unit length, y = 0).
 */
export function pickBestTable(
  candidates: ReadonlyArray<TableCandidate>,
  head: Vector3,
  forward: Vector3,
): TableCandidate | null {
  let best: TableCandidate | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const score = tableScore(candidate, head, forward);
    if (
      !best ||
      (candidate.labelledTable && !best.labelledTable) ||
      (candidate.labelledTable === best.labelledTable && score < bestScore)
    ) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
