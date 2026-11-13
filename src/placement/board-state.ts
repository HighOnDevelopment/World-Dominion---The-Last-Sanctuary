/**
 * Where the board is (P2 Ishan).
 *
 * The table placement system sets `board.anchor` once the board is placed.
 * Every other system adds its objects as children of `board.root`, using
 * board-local coordinates, so moving/scaling the board moves everything.
 */
import type { Entity } from '@iwsdk/core';

export const board: {
  /** Entity at the centre of the table top, +Z facing the player. */
  anchor: Entity | null;
  /** Entity at the centre of the board's TOP surface. Put game objects here. */
  root: Entity | null;
} = {
  anchor: null,
  root: null,
};
