/**
 * Waypoint graph and shortest paths (T14, P1 Kartik).
 *
 * Plain TypeScript, no three.js. Units always walk node to node along the
 * EDGES in src/data/mission.ts. An edge with `requiresRelay` is closed until
 * that relay has been restored.
 */
import { EDGES, WAYPOINTS, type Edge, type Vec2, type WaypointId } from '../../data/mission.js';
import type { RelayId, RouteChoice } from '../../events.js';

export interface PathOptions {
  /** Relays restored so far (opens gated edges). */
  restoredRelays: ReadonlySet<RelayId>;
  /** Force one route: 'short' never uses long edges and vice versa. */
  route?: RouteChoice;
}

function edgeOpen(edge: Edge, options: PathOptions): boolean {
  if (edge.requiresRelay && !options.restoredRelays.has(edge.requiresRelay)) return false;
  if (options.route === 'short' && edge.route === 'long') return false;
  if (options.route === 'long' && edge.route === 'short') return false;
  return true;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** The waypoint closest to a board-local point. */
export function nearestWaypoint(point: Vec2): WaypointId {
  let best: WaypointId = 'sanctuary';
  let bestDistance = Infinity;
  for (const id of Object.keys(WAYPOINTS) as WaypointId[]) {
    const d = dist(point, WAYPOINTS[id]);
    if (d < bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}

/** Shortest list of waypoints from `from` to `to`, or null if unreachable. */
export function shortestPath(
  from: WaypointId,
  to: WaypointId,
  options: PathOptions,
): WaypointId[] | null {
  const ids = Object.keys(WAYPOINTS) as WaypointId[];
  const distance = new Map<WaypointId, number>(ids.map((id) => [id, Infinity]));
  const previous = new Map<WaypointId, WaypointId>();
  const open = new Set<WaypointId>(ids);
  distance.set(from, 0);

  while (open.size > 0) {
    let current: WaypointId | null = null;
    for (const id of open) {
      if (current === null || distance.get(id)! < distance.get(current)!) current = id;
    }
    if (current === null || distance.get(current) === Infinity) break;
    open.delete(current);
    if (current === to) break;
    for (const edge of EDGES) {
      if (!edgeOpen(edge, options)) continue;
      const next =
        edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (!next || !open.has(next)) continue;
      const candidate = distance.get(current)! + dist(WAYPOINTS[current], WAYPOINTS[next]);
      if (candidate < distance.get(next)!) {
        distance.set(next, candidate);
        previous.set(next, current);
      }
    }
  }

  if (distance.get(to) === Infinity) return null;
  const path: WaypointId[] = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0])!);
  return path;
}

/** Waypoints sorted by distance from a board-local point, nearest first. */
function waypointsByDistance(point: Vec2): WaypointId[] {
  return (Object.keys(WAYPOINTS) as WaypointId[]).sort(
    (a, b) => dist(point, WAYPOINTS[a]) - dist(point, WAYPOINTS[b]),
  );
}

/** How many waypoints near the destination to try before giving up. */
const NEARBY_WAYPOINTS = 3;
/** A destination waypoint must be this close to the clicked point. */
const MAX_END_DISTANCE_M = 0.06;

/**
 * Full list of board points a unit walks through to reach `destination`:
 * the nearest waypoint, then the graph path, then the exact destination.
 * Units always join the graph at their NEAREST waypoint (no cutting across
 * the board). If the waypoint nearest the destination cannot be reached
 * (e.g. it is on the other route), nearby ones are tried instead.
 * Returns null if the destination cannot be reached with the open edges.
 */
export function planRoute(
  start: Vec2,
  destination: Vec2,
  options: PathOptions,
): Vec2[] | null {
  const from = nearestWaypoint(start);
  const ends = waypointsByDistance(destination)
    .slice(0, NEARBY_WAYPOINTS)
    .filter((id, index) => index === 0 || dist(WAYPOINTS[id], destination) <= MAX_END_DISTANCE_M);
  for (const to of ends) {
    const nodes = shortestPath(from, to, options);
    if (!nodes) continue;
    const points: Vec2[] = nodes.map((id) => WAYPOINTS[id]);
    if (dist(points[points.length - 1], destination) > 0.005) points.push(destination);
    return points;
  }
  return null;
}
