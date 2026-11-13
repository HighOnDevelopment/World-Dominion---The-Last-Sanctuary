/**
 * Debug input (T09 contract, P1 Kartik) - DEVELOPMENT ONLY.
 *
 * Lets everyone test gameplay before hand controls (T13/T15) exist.
 * Keyboard (works in XR and in the normal browser view):
 *   1  send the squad to the main relay by the SHORT route
 *   2  send the squad to the main relay by the LONG route (closed until 3)
 *   3  spend Energy to restore the East Relay (opens the long route)
 *   0  send the squad home to the Sanctuary
 * Mouse (normal browser view only, not in XR):
 *   click a squad unit to select the squad, then click the board to move it.
 *
 * It only emits the same events the real hand controls will emit, so nothing
 * else needs to change when T13/T15 replace it.
 */
import { createSystem, Plane, Raycaster, Vector2, Vector3 } from '@iwsdk/core';
import { RESOURCES, WAYPOINTS } from '../data/mission.js';
import { events } from '../events.js';
import { resources } from '../game/resources/resources.js';
import { level } from '../level/level-state.js';
import { board } from '../placement/board-state.js';

const SQUAD_IDS = new Set(['restorer', 'sentinel-1', 'sentinel-2']);
/** How close (metres, board-local) a click must be to pick a unit. */
const PICK_RADIUS = 0.03;

export class DebugInputSystem extends createSystem({}) {
  private selected: string | null = null;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly plane = new Plane();
  private readonly hit = new Vector3();
  private readonly normal = new Vector3();

  init(): void {
    if (!import.meta.env.DEV) return;
    const onKey = (event: KeyboardEvent) => this.onKey(event.key);
    const canvas = this.world.renderer.domElement;
    const onPointer = (event: PointerEvent) => this.onPointer(event, canvas);
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onPointer);
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', onKey),
      () => canvas.removeEventListener('pointerdown', onPointer),
    );
    console.info('[debug] Keys: 1 short route, 2 long route, 3 restore East Relay, 0 go home.');
  }

  private onKey(key: string): void {
    const [rx, rz] = WAYPOINTS.relay;
    const [hx, hz] = WAYPOINTS.sanctuary;
    switch (key) {
      case '1':
        console.info('[debug] squad -> relay by the short route');
        events.emit('destinationChosen', { unitId: 'squad', x: rx, z: rz, route: 'short' });
        break;
      case '2':
        console.info('[debug] squad -> relay by the long route');
        events.emit('destinationChosen', { unitId: 'squad', x: rx, z: rz, route: 'long' });
        break;
      case '3':
        if (resources.spend('energy', RESOURCES.eastRelayCost)) {
          console.info('[debug] East Relay restored');
          events.emit('relayRestored', { relayId: 'eastRelay' });
        } else {
          console.warn('[debug] not enough Energy to restore the East Relay');
        }
        break;
      case '0':
        console.info('[debug] squad -> home');
        events.emit('destinationChosen', { unitId: 'squad', x: hx, z: hz });
        break;
    }
  }

  private onPointer(event: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this.world.xrSession || !board.root?.object3D) return;
    const rect = canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.world.camera);

    // Intersect the board's top surface.
    const root = board.root.object3D;
    root.updateWorldMatrix(true, false);
    this.normal.set(0, 1, 0).transformDirection(root.matrixWorld);
    this.plane.setFromNormalAndCoplanarPoint(this.normal, root.getWorldPosition(this.hit));
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return;
    const local = root.worldToLocal(this.hit);

    // Clicked a squad unit? Select the squad.
    for (const id of SQUAD_IDS) {
      const unit = level.units.get(id)?.object3D;
      if (unit && Math.hypot(unit.position.x - local.x, unit.position.z - local.z) < PICK_RADIUS) {
        this.selected = 'squad';
        console.info('[debug] squad selected - click the board to move it');
        events.emit('unitSelected', { unitId: 'squad' });
        return;
      }
    }
    if (this.selected) {
      events.emit('destinationChosen', { unitId: this.selected, x: local.x, z: local.z });
    }
  }
}
