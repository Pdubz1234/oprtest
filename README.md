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
- Movement budgets, difficult terrain caps, impassable rock/ruin paths, base collisions and enemy spacing outside charges.
- Alternating activations, four rounds, end-of-round objective control, sticky ownership and neutralization when contested. Objective range is measured from the base edge.
- Shaken/recovery and casualty controls, undo, D6 tray, ruler, grid/deployment overlays, and an in-app guide.
- Device-local autosave of the board and in-progress activation. Undo history is session-only. New battle has a confirmation and creates a fresh terrain layout; reset can be undone in-session.

## Deliberate first-version limits

This is a hotseat board, not online multiplayer or a complete combat simulator. Demo rosters have no points or official army profiles; each miniature is one single-model unit. Deployment is pre-set, with Azure taking the first activation, instead of a roll-off. Three objectives are pre-set instead of rolled/alternately placed.

Shooting, line of sight, cover modifiers, wounds, melee, fatigue, morale tests, dangerous terrain, multi-model coherency, spells, special movement and special rules are manual. The Charge tool supplies a 12″ movement budget and relaxes the enemy 1″ exclusion, but target eligibility and final base contact are resolved manually. Rocks/ruins are simplified as impassable sight blockers; woods/brush are cover and difficult terrain. The ruler measures center to center, not base edges. No PDF is distributed with this application.

Original rules © OPR Games, created by Gaetano Ferrara. Unofficial fan-made companion; no affiliation or endorsement.
