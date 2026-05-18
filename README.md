# Cyberpunk Tic-Tac-Toe Playable

Cyberpunk Tic-Tac-Toe Playable is a mobile playable ad built with Three.js, TypeScript, and `@smoud/playable-sdk`. The project is based on [`smoudjs/playable-template-three`](https://github.com/smoudjs/playable-template-three), but the original template scene has been replaced with a complete neon 3D tic-tac-toe mini-game.

The playable presents a low-resolution cyberpunk board floating above a dark city grid. The player places neon magenta `X` marks against a CPU that responds with cyan `O` marks. A CRT overlay, pixelated renderer, city lights, screen shake, hover previews, and animated end screen create the final ad feel.

## Project Goal

This project is intended to produce a single-file playable ad that can be previewed locally and exported through Smoud's playable build pipeline.

The core experience is:

- Player taps an empty tile on a 3D tic-tac-toe board.
- The selected mark animates into place with an elastic scale effect.
- The CPU chooses a response move using simple tactical logic.
- Winning cells glow in the winner's color.
- The end screen appears with replay and install CTAs.
- The install CTA is routed through `@smoud/playable-sdk`.

## Tech Stack

- `three` - 3D rendering, scene, camera, lights, meshes, raycasting
- `@smoud/playable-sdk` - playable lifecycle, resize, pause/resume, install CTA, finish event
- `@smoud/playable-scripts` - local dev server and production playable build
- `typescript` - project source code
- `css` - HUD, CRT overlay, end screen, responsive CTA layout

## Scripts

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

The dev server runs on:

```text
http://localhost:3000/
```

Build the playable:

```bash
npm run build
```

The build command writes a single HTML playable into `dist/`.

## Project Structure

```text
.
|-- build.json
|-- package.json
|-- src
|   |-- Game.ts
|   |-- index.css
|   |-- index.html
|   `-- index.ts
|-- dist
`-- legacy-standalone.html
```

## Main Files

`src/index.ts`

Initializes `@smoud/playable-sdk`, creates the `Game` instance, and connects SDK lifecycle events:

- `resize`
- `pause`
- `resume`
- `volume`
- `finish`

`src/Game.ts`

Contains the playable itself:

- Three.js scene setup
- camera and renderer setup
- cyberpunk board creation
- city background generation
- tic-tac-toe board state
- CPU move logic
- raycast pointer interaction
- mark placement animation
- win/draw detection
- end screen behavior
- SDK install CTA call

`src/index.css`

Defines the visual presentation:

- full-screen playable layout
- pixelated canvas scaling
- CRT scanline overlay
- noise overlay
- HUD panels
- neon magenta/cyan text glow
- app icon
- replay/install buttons
- responsive CTA layout

`src/index.html`

Minimal HTML shell used by the Smoud build pipeline.

`build.json`

Playable metadata used by `@smoud/playable-scripts`, including app name, version, and store URLs.

`legacy-standalone.html`

Preserved copy of the original standalone single-file version before it was ported into the Smoud Three.js template.

## Gameplay Logic

The board is stored as an array of 9 values:

```ts
type CellValue = 'X' | 'O' | null;
```

The player always uses `X`; the CPU uses `O`.

After each player move, the game checks for a win or draw. If the game continues, the CPU chooses a move using this priority:

1. Complete its own winning line if possible.
2. Block the player's winning line if needed.
3. Take the center cell.
4. Take a random available corner.
5. Take a random available edge.

Win lines are defined in `WIN_LINES` inside `src/Game.ts`.

## Rendering Details

The visual style is intentionally chunky and low-resolution:

- Renderer pixel ratio is fixed to `1`.
- The internal render width is fixed at `426`.
- CSS stretches the canvas to the viewport using `image-rendering: pixelated`.
- The scene uses simple low-poly geometry and emissive neon materials.

The board is made from `BoxGeometry` cells. Player `X` marks are two crossed boxes. CPU `O` marks are low-poly torus meshes.

The city background uses an `InstancedMesh` for performance, plus a `Points` object for distant magenta/cyan light particles.

## SDK Integration

The playable uses `@smoud/playable-sdk` for ad lifecycle behavior.

In `src/index.ts`, the SDK initializes the game and forwards lifecycle events to the `Game` class.

In `src/Game.ts`, the install button calls:

```ts
sdk.install();
```

The end screen calls:

```ts
sdk.finish();
```

This keeps CTA and completion behavior compatible with the Smoud playable pipeline.

## Editing Guide

To change the game title or store URLs, edit:

```text
build.json
```

To change gameplay behavior, edit:

```text
src/Game.ts
```

Useful sections in `src/Game.ts`:

- `WIN_LINES` - winning combinations
- `createBoard()` - board geometry
- `createCity()` - background city
- `placeMark()` - move placement and animation
- `cpuMove()` - CPU decision logic
- `endGame()` - win/draw result handling
- `handleInstallClick()` - install CTA behavior

To change visual styling, edit:

```text
src/index.css
```

## Build Output

After running:

```bash
npm run build
```

the generated playable appears in `dist/`. The current build output name follows the metadata from `build.json`, for example:

```text
dist/Cyberpunk Tic-Tac-Toe_Cyberpunk Tic-Tac-Toe_v1_20260518_en_Preview.html
```

## Notes

- The active project entry is `src/index.html`, not the root-level legacy standalone file.
- The project no longer depends on CDN Three.js imports or remote Google Fonts.
- Template sample assets were removed because the current playable is fully generated through Three.js geometry and CSS.
- `npm install` may report audit findings from the template dependency tree. Review dependency updates carefully before applying automated fixes.
