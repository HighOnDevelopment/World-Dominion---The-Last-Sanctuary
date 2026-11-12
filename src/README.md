# Source layout and ownership

Each folder has one owner. To change someone else's system, ask them or open a
small PR they review. Systems talk to each other only through `src/events.ts`.

| Folder | What lives here | Owner |
| --- | --- | --- |
| `events.ts` | Typed event bus shared by every system | P1 + P3 (shared) |
| `xr/` | XR session helpers | P1 (Kartik) |
| `input/` | Hand selection, point-to-move, gaze (stretch) | P1 (Kartik) |
| `ui/` | HUD, tutorial panels, title/win/fail screens (UIKitML) | P1 (Kartik) |
| `game/units/` | Squads, unit movement on the waypoint graph | P1 (Kartik) |
| `game/resources/` | Survivors, Energy, Materials | P1 (Kartik) |
| `placement/` | Finding the real table, placing/moving/scaling the board | P2 (Ishan) |
| `level/` | Board layout: sanctuary, routes, relay, camp, Archive | P2 (Ishan) |
| `game/reconstruction/` | Archive rebuilding and region reveal | P2 (Ishan) |
| `vfx/` | Selection rings, restoration particles, gateway effects | P2 (Ishan) |
| `game/ai/` | Enemy state machine | P3 (Utkarsh) |
| `game/combat/` | Health and combat | P3 (Utkarsh) |
| `game/mission/` | Mission flow, route choice, win/fail | P3 (Utkarsh) |
| `audio/` | Spatial sound and music | P3 (Utkarsh) |
| `data/` | Typed tuning numbers (speeds, costs, timers) | Shared |

Rules:

- All game positions are in **board-local coordinates** (metres, origin at the
  centre of the board's top surface, +Z towards the player). The board can then
  be moved, rotated or scaled without breaking anyone's logic.
- Import Three.js classes from `@iwsdk/core`, never from `three`.
- Run `npm run typecheck` before every commit.
