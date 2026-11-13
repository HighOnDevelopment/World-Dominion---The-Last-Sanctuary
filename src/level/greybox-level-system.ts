/**
 * Greybox level (T19, P2 Ishan).
 *
 * As soon as the board is placed on the table, builds the whole mission out
 * of simple boxes and capsules from src/data/mission.ts:
 *   board, both routes, Sanctuary, Archive (ruined), both relays, Survivor
 *   Camp, the squad, the civilians, the invaders and a grabbable energy core.
 * Real art replaces these later (T36) by swapping meshes, not logic.
 *
 * Colours: short route red (danger), long route blue (safe; dimmed until the
 * East Relay is restored), shared path grey.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  createSystem,
  Entity,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OneHandGrabbable,
  SphereGeometry,
} from '@iwsdk/core';
import {
  BOARD,
  EDGES,
  INVADERS,
  LOCATIONS,
  SQUAD,
  SURVIVORS,
  WAYPOINTS,
  type UnitRole,
  type Vec2,
} from '../data/mission.js';
import { events } from '../events.js';
import { board } from '../placement/board-state.js';
import { level } from './level-state.js';

const COLORS = {
  board: 0x37474f,
  shortRoute: 0xe57373,
  longRoute: 0x64b5f6,
  sharedRoute: 0xb0bec5,
  sanctuary: 0xffcc80,
  archiveRuined: 0x8d6e63,
  relayBroken: 0x616161,
  camp: 0xa1887f,
  energyCore: 0x00e5ff,
  invader: 0x8e24aa,
} as const;

const UNIT_COLORS: Record<UnitRole, number> = {
  keeper: 0xffd54f,
  restorer: 0x81c784,
  sentinel: 0x4fc3f7,
  civilian: 0xeeeeee,
};

function material(color: number, opacity = 1): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.8,
    transparent: opacity < 1,
    opacity,
  });
}

function box(name: string, w: number, h: number, d: number, color: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material(color));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A capsule standing on the board, `height` tall overall. */
function capsule(name: string, radius: number, height: number, color: number): Mesh {
  const mesh = new Mesh(
    new CapsuleGeometry(radius, Math.max(height - radius * 2, 0.001), 4, 12),
    material(color),
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.position.y = height / 2;
  return mesh;
}

/** Wraps a mesh in a group at board position (x, z) so it sits on the board. */
function placed(object: Object3D, at: Vec2, lift = 0): Object3D {
  object.position.x = at[0];
  object.position.z = at[1];
  object.position.y += lift;
  return object;
}

export class GreyboxLevelSystem extends createSystem({}) {
  init(): void {
    this.cleanupFuncs.push(events.on('boardPlaced', () => this.build()));
  }

  private add(object: Object3D, parent: Entity | null = board.root): Entity {
    return this.world.createTransformEntity(object, parent ? { parent } : undefined);
  }

  private build(): void {
    if (level.built || !board.anchor || !board.root) return;

    // The board slab itself, sitting on the table top.
    const slab = box('board', BOARD.width, BOARD.thickness, BOARD.depth, COLORS.board);
    slab.position.y = BOARD.thickness / 2;
    slab.castShadow = false;
    this.add(slab, board.anchor);

    this.buildPaths();
    this.buildPlaces();
    this.buildUnits();

    // Energy core: the Restorer carries it to the relay (T25 makes it snap in).
    const core = new Mesh(new SphereGeometry(0.012, 16, 12), material(COLORS.energyCore));
    core.name = 'energy-core';
    core.castShadow = true;
    placed(core, [0.06, 0.15], 0.012);
    level.energyCore = this.add(core);
    level.energyCore.addComponent(OneHandGrabbable);

    level.built = true;
    console.info(
      `[level] Greybox built: ${level.places.size} places, ${level.units.size} units, ` +
        `${level.invaders.size} invaders, ${level.paths.size} path segments.`,
    );
  }

  private buildPaths(): void {
    for (const edge of EDGES) {
      const [ax, az] = WAYPOINTS[edge.from];
      const [bx, bz] = WAYPOINTS[edge.to];
      const length = Math.hypot(bx - ax, bz - az);
      const color =
        edge.route === 'short'
          ? COLORS.shortRoute
          : edge.route === 'long'
            ? COLORS.longRoute
            : COLORS.sharedRoute;
      const segment = new Mesh(
        new BoxGeometry(0.012, 0.002, length),
        material(color, edge.requiresRelay ? 0.3 : 1),
      );
      segment.name = `path-${edge.from}-${edge.to}`;
      segment.receiveShadow = true;
      segment.position.set((ax + bx) / 2, 0.001, (az + bz) / 2);
      segment.rotation.y = Math.atan2(bx - ax, bz - az);
      level.paths.set(`${edge.from}-${edge.to}`, this.add(segment));
    }
  }

  private buildPlaces(): void {
    const sanctuary = box('sanctuary', 0.09, 0.05, 0.06, COLORS.sanctuary);
    level.places.set('sanctuary', this.add(placed(sanctuary, LOCATIONS.sanctuary, 0.025)));

    // Ruined Archive: low and brown until it is rebuilt (T34).
    const archive = box('archive', 0.06, 0.02, 0.05, COLORS.archiveRuined);
    level.places.set('archive', this.add(placed(archive, LOCATIONS.archive, 0.01)));

    for (const id of ['mainRelay', 'eastRelay'] as const) {
      const tower = box(id === 'mainRelay' ? 'relay-main' : 'relay-east', 0.025, 0.08, 0.025, COLORS.relayBroken);
      level.places.set(id, this.add(placed(tower, LOCATIONS[id], 0.04)));
    }

    const camp = box('camp', 0.07, 0.015, 0.06, COLORS.camp);
    level.places.set('camp', this.add(placed(camp, LOCATIONS.camp, 0.0075)));
  }

  private buildUnits(): void {
    for (const unit of [...SQUAD, ...SURVIVORS]) {
      const height = unit.role === 'keeper' ? 0.04 : 0.03;
      const mesh = capsule(unit.id, 0.008, height, UNIT_COLORS[unit.role]);
      level.units.set(unit.id, this.add(placed(mesh, unit.at)));
    }
    for (const invader of INVADERS) {
      const mesh = capsule(invader.id, 0.01, 0.04, COLORS.invader);
      level.invaders.set(invader.id, this.add(placed(mesh, invader.patrol[0])));
    }
  }
}
