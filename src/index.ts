/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GreyboxLevelSystem } from './level/greybox-level-system.js';
import { TablePlacementSystem } from './placement/table-placement-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // P2: build the board as soon as it is placed (T19). Register before
  // placement so it is listening when the board lands.
  world.registerSystem(GreyboxLevelSystem);
  // P2: find the real table and place the board on it (T09).
  world.registerSystem(TablePlacementSystem);
});
