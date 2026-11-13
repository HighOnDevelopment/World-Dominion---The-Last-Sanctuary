/**
 * Table placement (T09, P2 Ishan).
 *
 * When the player enters XR, this system looks at what scene understanding
 * found in the room, picks the best table, and puts the board anchor on it.
 * The board itself is built on the anchor by the level system (T19).
 * If no table is found within a few seconds, it falls back to placing the
 * anchor in front of the player at a comfortable seated height.
 *
 * Later tasks build on this: T19 puts the greybox board on the anchor,
 * T20/T21 add moving and scaling, T35 hardens it for untested rooms.
 */
import {
  createSystem,
  Group,
  Quaternion,
  Vector3,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { events, type BoardPlacementSource } from '../events.js';
import { BOARD } from '../data/mission.js';
import { board } from './board-state.js';
import {
  candidateFromMesh,
  tableScore,
  candidateFromPlane,
  pickBestTable,
  type PlaneLike,
  type TableCandidate,
} from './table-finder.js';

/** Wait this long after entering XR so the room scan can arrive. */
const SETTLE_SECONDS = 1.5;
/** Give up looking for a table after this long and use the fallback. */
const FALLBACK_AFTER_SECONDS = 4;
/** Keep this much table visible around the board. */
const TABLE_MARGIN_M = 0.03;

export class TablePlacementSystem extends createSystem({
  meshes: { required: [XRMesh] },
  planes: { required: [XRPlane] },
}) {
  private placed = false;
  private searchStartTime = -1;
  private readonly head = new Vector3();
  private readonly forward = new Vector3();
  private readonly headRotation = new Quaternion();

  update(_delta: number, time: number): void {
    if (this.placed) return;
    if (!this.world.xrSession) {
      this.searchStartTime = -1;
      return;
    }
    if (this.searchStartTime < 0) this.searchStartTime = time;
    const elapsed = time - this.searchStartTime;
    if (elapsed < SETTLE_SECONDS) return;

    this.player.head.getWorldPosition(this.head);
    this.updateForward();
    const candidates = this.collectCandidates();
    const best = pickBestTable(candidates, this.head, this.forward);
    if (best) {
      console.info(`[placement] ${candidates.length} table candidate(s) found:`);
      console.table(
        candidates.map((c) => ({
          source: c.source,
          labelledTable: c.labelledTable,
          heightM: +c.topY.toFixed(2),
          sizeM: `${c.sizeX.toFixed(2)} x ${c.sizeZ.toFixed(2)}`,
          distanceM: +c.distance.toFixed(2),
          score: +tableScore(c, this.head, this.forward).toFixed(2),
          x: +c.center.x.toFixed(2),
          z: +c.center.z.toFixed(2),
        })),
      );
      this.placeOnTable(best);
    } else if (elapsed > FALLBACK_AFTER_SECONDS) {
      this.placeFallback();
    }
  }

  /** The horizontal looking direction of the player (unit length, y = 0). */
  private updateForward(): void {
    this.player.head.getWorldQuaternion(this.headRotation);
    this.forward.set(0, 0, -1).applyQuaternion(this.headRotation);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
  }

  /** Every table-like surface currently known, as candidates. */
  private collectCandidates(): TableCandidate[] {
    const candidates: TableCandidate[] = [];
    for (const entity of this.queries.meshes.entities) {
      const object = entity.object3D;
      if (!object || !entity.getValue(XRMesh, 'isBounded3D')) continue;
      const candidate = candidateFromMesh(
        object,
        entity.getVectorView(XRMesh, 'min'),
        entity.getVectorView(XRMesh, 'max'),
        entity.getValue(XRMesh, 'semanticLabel') ?? '',
        this.head,
      );
      if (candidate) candidates.push(candidate);
    }
    for (const entity of this.queries.planes.entities) {
      const object = entity.object3D;
      const plane = entity.getValue(XRPlane, '_plane') as PlaneLike | undefined;
      if (!object || !plane) continue;
      const candidate = candidateFromPlane(object, plane, this.head);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  private placeOnTable(table: TableCandidate): void {
    // Shrink the board (never grow it) if the table is smaller than the board.
    const fit = Math.min(
      1,
      (table.sizeX - TABLE_MARGIN_M * 2) / BOARD.width,
      (table.sizeZ - TABLE_MARGIN_M * 2) / BOARD.depth,
    );
    this.createBoardAnchor(table.center, Math.max(fit, 0.5), table.source, table.topY);
    console.info(
      `[placement] Board placed on ${table.source} at height ${table.topY.toFixed(2)} m ` +
        `(table ${table.sizeX.toFixed(2)} x ${table.sizeZ.toFixed(2)} m, ` +
        `${table.distance.toFixed(2)} m away, labelled table: ${table.labelledTable})`,
    );
  }

  private placeFallback(): void {
    // 0.6 m in front of the player's face, at seated-table height.
    const center = this.head.clone().addScaledVector(this.forward, 0.6);
    center.y = Math.max(0.5, this.head.y - 0.55);
    this.createBoardAnchor(center, 1, 'fallback', center.y);
    console.warn('[placement] No table found; board placed in front of the player.');
  }

  private createBoardAnchor(
    center: Vector3,
    scale: number,
    source: BoardPlacementSource,
    tableHeightM: number,
  ): void {
    const anchor = new Group();
    anchor.name = 'board-anchor';
    anchor.position.copy(center);
    // Turn the anchor so its +Z axis points at the player.
    anchor.rotation.y = Math.atan2(this.head.x - center.x, this.head.z - center.z);
    anchor.scale.setScalar(scale);
    board.anchor = this.world.createTransformEntity(anchor);

    // Game objects sit on the board's top surface.
    const root = new Group();
    root.name = 'board-root';
    root.position.y = BOARD.thickness;
    board.root = this.world.createTransformEntity(root, { parent: board.anchor });

    this.placed = true;
    events.emit('boardPlaced', { source, tableHeightM });
  }
}
