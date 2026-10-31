import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE,
  ACTIONS,
  createGame,
  terrain,
  distance,
  moveResult,
  finishActivation,
  roundComplete,
  nextRound,
  score,
} from "../public/game.js";
test("48 inch setup has twelve 32 mm single-model units and 20 terrain pieces", () => {
  const g = createGame();
  assert.equal(g.units.length, 12);
  assert.equal(terrain().length, 20);
  assert.equal(BASE, 32 / 25.4);
  assert.ok(g.units.filter((u) => u.team === 0).every((u) => u.x < 12));
  assert.ok(g.units.filter((u) => u.team === 1).every((u) => u.x > 36));
  assert.equal(g.objectives.length, 3);
  for (const a of g.objectives)
    for (const b of g.objectives) if (a !== b) assert.ok(distance(a, b) > 9);
});
test("terrain layouts are repeatable and change for a new seed", () => {
  assert.deepEqual(terrain(2), terrain(2));
  assert.notDeepEqual(terrain(1), terrain(2));
});
test("advance allows six inches and rejects excess total movement", () => {
  const g = createGame();
  assert.equal(moveResult(g, "0-0", { x: 1, y: 8 }, "advance").length, 6);
  assert.match(moveResult(g, "0-0", { x: 1, y: 8 }, "advance", 1).error, /6″/);
});
test("hold cannot move and rush allows twelve inches", () => {
  const g = createGame();
  g.units = [{ ...g.units[0], x: 4, y: 18 }];
  assert.match(moveResult(g, "0-0", { x: 4, y: 19 }, "hold").error, /0″/);
  assert.equal(moveResult(g, "0-0", { x: 4, y: 30 }, "rush").length, 12);
});
test("rejects wrong team, used units, shaken movement, off-board and invalid input", () => {
  const g = createGame();
  assert.match(
    moveResult(g, "1-0", { x: 40, y: 8 }, "advance").error,
    /available/,
  );
  g.units[0].activated = true;
  assert.ok(moveResult(g, "0-0", { x: 6, y: 8 }, "advance").error);
  g.units[0].activated = false;
  g.units[0].shaken = true;
  assert.match(moveResult(g, "0-0", { x: 6, y: 8 }, "advance").error, /Shaken/);
  g.units[0].shaken = false;
  for (const x of [0, 48, NaN, Infinity])
    assert.ok(moveResult(g, "0-0", { x, y: 8 }, "advance").error);
  assert.ok(moveResult(g, "0-0", { x: 6, y: 8 }, "invalid").error);
});
test("rocks and ruins block paths", () => {
  const g = createGame();
  const t = terrain().find((t) => t.type === "ruin");
  g.units = [{ ...g.units[0], x: t.x - 4, y: t.y }];
  assert.match(
    moveResult(g, "0-0", { x: t.x + 4, y: t.y }, "rush").error,
    /blocked/,
  );
});
test("difficult terrain caps rush at six total inches", () => {
  const g = createGame();
  const t = terrain().find((t) => t.type === "wood");
  g.units = [{ ...g.units[0], x: t.x, y: t.y - 3 }];
  assert.match(
    moveResult(g, "0-0", { x: t.x, y: t.y + 4 }, "rush").error,
    /Difficult terrain/,
  );
  const result = moveResult(g, "0-0", { x: t.x, y: t.y }, "rush");
  assert.equal(result.difficult, true);
  assert.equal(result.length, 3);
});
test("bases cannot move through one another", () => {
  const g = createGame();
  g.units = g.units.slice(0, 2);
  g.units[0].x = 3;
  g.units[0].y = 4;
  g.units[1].x = 3;
  g.units[1].y = 7;
  assert.match(
    moveResult(g, "0-0", { x: 3, y: 10 }, "advance").error,
    /blocks/,
  );
});
test("stay one inch from enemies except when charging", () => {
  const g = createGame();
  g.units = [
    { ...g.units[0], x: 3, y: 4 },
    { ...g.units[6], x: 3, y: 9 },
  ];
  assert.match(
    moveResult(g, "0-0", { x: 3, y: 7 }, "advance").error,
    /Stay 1″/,
  );
  assert.equal(moveResult(g, "0-0", { x: 3, y: 7 }, "charge").length, 3);
  assert.ok(moveResult(g, "0-0", { x: 3, y: 9 }, "charge").error);
});
test("activations alternate, cannot be reused and recover shaken units", () => {
  const g = createGame();
  g.units[0].shaken = true;
  assert.equal(finishActivation(g, "0-0"), true);
  assert.equal(g.player, 1);
  assert.equal(g.units[0].shaken, false);
  assert.equal(finishActivation(g, "0-0"), false);
  assert.equal(finishActivation(g, "1-0"), true);
  assert.equal(g.player, 0);
});
test("side that finished first starts next round, remaining side can finish its units", () => {
  const g = createGame();
  g.units = g.units.filter((u) => u.id === "0-0" || u.team === 1);
  finishActivation(g, "0-0");
  for (const u of g.units.filter((u) => u.team === 1))
    assert.equal(finishActivation(g, u.id), true);
  assert.equal(g.firstFinished, 0);
  assert.equal(roundComplete(g), true);
  assert.equal(nextRound(g), true);
  assert.equal(g.player, 0);
  assert.equal(g.round, 2);
  assert.ok(g.units.every((u) => !u.activated));
});
test("cannot skip unactivated units or advance after game end", () => {
  const g = createGame();
  assert.equal(nextRound(g), false);
  g.units.forEach((u) => (u.activated = true));
  g.round = 4;
  assert.equal(nextRound(g), true);
  assert.equal(g.ended, true);
  assert.equal(nextRound(g), false);
  assert.equal(finishActivation(g, "0-0"), false);
});
test("objectives seize from base edge, persist when vacated, neutralize when contested", () => {
  const g = createGame();
  g.units.forEach((u) => (u.activated = true));
  g.units[0].x = 24 + 3 + BASE / 2;
  g.units[0].y = 12;
  nextRound(g);
  assert.equal(g.objectives[0].owner, 0);
  assert.equal(score(g, 0), 1);
  g.units[0].x = 7;
  g.units.forEach((u) => (u.activated = true));
  nextRound(g);
  assert.equal(g.objectives[0].owner, 0);
  g.units[0].x = 24;
  g.units[0].y = 12;
  g.units[6].x = 26;
  g.units[6].y = 12;
  g.units.forEach((u) => (u.activated = true));
  nextRound(g);
  assert.equal(g.objectives[0].owner, null);
});
test("shaken and removed miniatures cannot seize or contest", () => {
  const g = createGame();
  g.units[0].x = 24;
  g.units[0].y = 12;
  g.units[0].shaken = true;
  g.units[6].x = 24;
  g.units[6].y = 12;
  g.units[6].removed = true;
  g.units.forEach((u) => (u.activated = true));
  nextRound(g);
  assert.equal(g.objectives[0].owner, null);
});
