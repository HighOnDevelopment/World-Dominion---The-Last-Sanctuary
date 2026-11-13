/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
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
  world.registerSystem(DebugInputSystem); // P1: dev-only keys + mouse
  world.registerSystem(TablePlacementSystem); // P2: find the table (T09)
});
