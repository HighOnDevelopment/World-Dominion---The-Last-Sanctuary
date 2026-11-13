/**
 * Resource system (T16, P1 Kartik): sets the starting resources when the
 * board is first placed and logs every change for debugging.
 */
import { createSystem } from '@iwsdk/core';
import { events } from '../../events.js';
import { resources } from './resources.js';

export class ResourceSystem extends createSystem({}) {
  private started = false;

  init(): void {
    this.cleanupFuncs.push(
      events.on('boardPlaced', () => {
        if (this.started) return;
        this.started = true;
        resources.reset();
      }),
      events.on('resourceChanged', ({ resource, value, delta }) => {
        console.info(`[resources] ${resource} ${delta >= 0 ? '+' : ''}${delta} -> ${value}`);
      }),
    );
  }
}
