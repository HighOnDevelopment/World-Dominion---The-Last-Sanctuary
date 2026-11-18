/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { EnemyAISystem } from './game/ai/enemy-ai-system.js';
import { CombatSystem } from './game/combat/combat-system.js';
import { EscortSystem } from './game/mission/escort-system.js';
import { MissionSystem } from './game/mission/mission-system.js';
import { RelaySocketSystem } from './game/mission/relay-socket-system.js';
import { ResourceSystem } from './game/resources/resource-system.js';
import { UnitMovementSystem } from './game/units/unit-movement-system.js';
import { DebugInputSystem } from './input/debug-input-system.js';
import { GreyboxLevelSystem } from './level/greybox-level-system.js';
import { TablePlacementSystem } from './placement/table-placement-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Systems that listen for the board landing are registered first.
  world.registerSystem(GreyboxLevelSystem); // P2: build the board (T19)
  world.registerSystem(ResourceSystem); // P1: starting resources (T16)
  world.registerSystem(UnitMovementSystem); // P1: units walk the routes (T14)
  world.registerSystem(CombatSystem); // P3: health, sentinels fight back (T24)
  world.registerSystem(EnemyAISystem); // P3: invaders patrol/chase/attack (T23)
  world.registerSystem(RelaySocketSystem); // P3: plug the core into the relay (T25)
  world.registerSystem(EscortSystem); // P3: survivors follow the squad home (T27)
  world.registerSystem(MissionSystem); // P3: objectives, win/lose, timer (T26)
  world.registerSystem(DebugInputSystem); // P1: dev-only keys + mouse
  world.registerSystem(TablePlacementSystem); // P2: find the table (T09)
});
