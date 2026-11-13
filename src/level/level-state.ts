/**
 * Everything the greybox level created, by id (P2 Ishan).
 *
 * Other systems look objects up here instead of creating their own copies:
 *   - P1 unit movement: level.units.get('sentinel-1')
 *   - P3 enemy AI:      level.invaders.get('invader-1')
 *   - P3 relay socket:  level.places.get('mainRelay'), level.energyCore
 */
import type { Entity } from '@iwsdk/core';

export const level = {
  built: false,
  /** Buildings and landmarks: sanctuary, archive, mainRelay, eastRelay, camp. */
  places: new Map<string, Entity>(),
  /** Squad and civilians, keyed by the ids in src/data/mission.ts. */
  units: new Map<string, Entity>(),
  invaders: new Map<string, Entity>(),
  /** Path segments, keyed "from-to". */
  paths: new Map<string, Entity>(),
  energyCore: null as Entity | null,
};
