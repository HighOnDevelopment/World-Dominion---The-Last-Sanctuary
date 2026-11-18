/**
 * Helpers for board-local positions of objects that may have been
 * re-parented while grabbed (P3 Utkarsh).
 */
import { Object3D, Vector3 } from '@iwsdk/core';
import { board } from '../../placement/board-state.js';

const temp = new Vector3();

/** Board-local position of any object, wherever it is parented. */
export function boardLocalOf(object: Object3D, target = new Vector3()): Vector3 {
  const root = board.root?.object3D;
  object.getWorldPosition(target);
  if (root) root.worldToLocal(target);
  return target;
}

/** Put an object at a board-local position, wherever it is parented. */
export function setBoardLocal(object: Object3D, x: number, y: number, z: number): void {
  const root = board.root?.object3D;
  if (!root || !object.parent) {
    object.position.set(x, y, z);
    return;
  }
  temp.set(x, y, z);
  root.localToWorld(temp);
  object.parent.worldToLocal(temp);
  object.position.copy(temp);
}
