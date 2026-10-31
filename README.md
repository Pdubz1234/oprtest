# War Table

A responsive, local two-player tabletop companion for a 48″ × 48″ fantasy skirmish. Built from the supplied Age of Fantasy: Skirmish Core Rules v3.6.0 as an unofficial prototype.

## Run

Requires Node.js 22 or newer. No third-party dependencies, external fonts or image services.

```sh
npm install
npm run dev       # http://localhost:3000
npm test
npm run check
npm run build     # static site in dist/
```

Vercel builds with `npm run build` and serves `dist` via the committed configuration. No environment variables or database required.

## Included

- 48-inch square SVG battlefield, twenty generic terrain pieces, three objectives.
- Two demonstration warbands of six individual miniatures each, using 32 mm round bases to scale.
- Select a miniature in the roster or on the board; choose an action, then click to move. Focus a board miniature and press Enter to select; arrow keys move 1″.
- Zoom (50–400%, buttons or wheel), rotate in 45° steps, Pan view drag mode (mouse/touch), and Reset view. Camera changes never move units; arrow keys follow screen directions.
- On selection: green remaining-movement overlay, amber weapon-distance overlay and legal-target highlights (range, sight and action eligibility). Movement circles are upper bounds: terrain, bases, board edges and path checks still apply.
- Editable demo bow range (24″ default; 1–48″ allowed), saved per unit with undo. Melee uses base contact. Amber circles mark target centers at the weapon range plus both 32 mm base radii (edge-to-edge measurement). Dim amber means unavailable for the current action/activation.
- Pure rules functions in `public/game.js` share action eligibility, movement budgets, difficult-terrain state and range calculations between validation and overlays. Shared geometric line-of-sight checks and automated demo combat resolve attacks, saves, wounds, casualties and turn handoff.
- Movement budgets, difficult terrain caps, impassable rock/ruin paths, base collisions and enemy spacing outside charges.
- Alternating activations, four rounds, end-of-round objective control, sticky ownership and neutralization when contested. Objective range is measured from the base edge.
- Shaken/recovery and casualty controls, undo, D6 tray, ruler, grid/deployment overlays, and an in-app guide.
- Device-local autosave of the board and in-progress activation. Undo history is session-only. New battle has a confirmation and creates a fresh terrain layout; reset can be undone in-session.

## Deliberate first-version limits

This is a hotseat board, not online multiplayer or a complete combat simulator. Demo rosters have no points or official army profiles; each miniature is one single-model unit. Deployment is pre-set, with Azure taking the first activation, instead of a roll-off. Three objectives are pre-set instead of rolled/alternately placed.

## Demo combat and line of sight

Select a miniature, choose an action, then select an enemy in **Combat** or enable **Pick target on map**. Inspect the sight line and eligibility message before resolving. **Shoot & end activation** or **Resolve melee & end activation** rolls automatically, applies damage and passes the turn. The result shows every hit/save die, thresholds, cover, wounds and removal; the battle log keeps a summary. The entire exchange is one undo step and persists on reload.

- **Demo profiles only:** captains Q3+/D4+, 3 melee attacks, 3 HP; blades Q4+/D4+, 2 melee attacks, 1 HP; guardians Q4+/D3+, 2 melee attacks, 1 HP; rangers Q4+/D4+, 1 melee or bow attack, 1 HP. Bow range defaults to 24″ and remains editable. These are not official army profiles.
- **Shooting:** Hold or Advance, within base-edge weapon range, clear line of sight. Cannot fire while engaged or into melee. One die per attack; Quality or higher hits. Defender rolls once per hit; Defense or higher saves. Natural 1 always fails, 6 always succeeds.
- **2D sight:** a center-to-center ray is blocked by the rectangular rock/ruin footprints or any intervening living 32 mm base (friendly or enemy). Tangent contact blocks. No height, facing, partial visibility or true miniature silhouettes.
- **Cover:** a target base overlapping the axis-aligned woodland/brush footprint gains +1 to shooting save rolls. Woodland/brush do not block sight; intervening vegetation alone does not grant cover. Footprints are simplified rectangles, not the decorative art outlines.
- **Melee:** choose Charge (rangers switch to melee too). **Move to contact** attempts the nearest straight path to base contact using the same movement budget, terrain and collision checks as normal movement; use shorter manual moves to navigate around obstacles. There is no teleport or automatic pathfinding. In-contact units cannot move or shoot; choose Charge to fight again on a later activation.
- A surviving unshaken defender strikes back without using its activation. Any unit that has fought in melee hits only on natural 6 for later melee attacks that round, including retaliation. Fatigue clears next round. Cover never applies in melee.
- **Simplified damage:** each failed save inflicts one wound; at 0 HP the miniature is removed. This deliberately replaces official skirmish injury rolls. Morale, routs, disengagement, knockback, spells, special abilities, armor penetration and multi-model units remain manual/unimplemented. Demo combat does not claim full AoFS compliance.

The ruler measures center to center, not base edges. No PDF is distributed with this application.

Original rules © OPR Games, created by Gaetano Ferrara. Unofficial fan-made companion; no affiliation or endorsement.
