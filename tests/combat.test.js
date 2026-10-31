import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE,
  createGame,
  terrain,
  lineOfSight,
  segmentIntersectsRect,
  attackCheck,
  resolveAttack,
  combatProfile,
  woundsLeft,
  unitRanges,
  chargeDestination,
  distance,
  moveResult,
  nextRound,
} from "../public/game.js";
function duel(kind = "bow") {
  const g = createGame();
  g.units = [
    { ...g.units[3], kind, x: 3, y: 3 },
    { ...g.units[6], x: 3, y: 10 },
  ];
  return g;
}
function rolls(...values) {
  let i = 0;
  return () => {
    assert.ok(i < values.length, "Unexpected extra die roll");
    return values[i++];
  };
}
test("analytic rectangle sight intersection handles horizontal, vertical, tangents and thin blockers", () => {
  const rect = { x: 5, y: 5, w: 0.01, h: 4 };
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 5 }, { x: 10, y: 5 }, rect),
    true,
  );
  assert.equal(
    segmentIntersectsRect({ x: 5, y: 0 }, { x: 5, y: 10 }, rect),
    true,
  );
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 7 }, { x: 10, y: 7 }, rect),
    true,
  );
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 7.01 }, { x: 10, y: 7.01 }, rect),
    false,
  );
  assert.equal(
    segmentIntersectsRect({ x: 4, y: 0 }, { x: 4, y: 10 }, rect),
    false,
  );
  assert.equal(
    segmentIntersectsRect({ x: 5, y: 5 }, { x: 5, y: 5 }, rect),
    true,
  );
});
test("rocks/ruins block shooting in either direction, even at short range", () => {
  for (const type of ["rock", "ruin"]) {
    const g = duel(),
      [a, b] = g.units,
      t = terrain(g.seed).find((t) => t.type === type);
    Object.assign(a, { x: t.x - 3, y: t.y });
    Object.assign(b, { x: t.x + 3, y: t.y });
    assert.equal(lineOfSight(g, a, b).clear, false);
    assert.equal(lineOfSight(g, b, a).clear, false);
    assert.match(attackCheck(g, a.id, b.id, "advance").error, /Blocked/);
    assert.ok(!unitRanges(g, a, "advance").targets.includes(b.id));
  }
});
test("live friendly/enemy bases block; removed and off-ray models do not", () => {
  const g = duel(),
    [a, b] = g.units;
  for (const team of [0, 1]) {
    g.units[2] = { ...a, id: "blocker", name: "Screen", team, x: 3, y: 7 };
    assert.match(lineOfSight(g, a, b).reason, /Screen/);
    g.units[2].removed = true;
    assert.equal(lineOfSight(g, a, b).clear, true);
    g.units[2].removed = false;
    g.units[2].x = 4;
    assert.equal(lineOfSight(g, a, b).clear, true);
  }
});
test("wood/brush give target-base cover without blocking sight", () => {
  for (const type of ["wood", "scrub"]) {
    const g = duel(),
      [a, b] = g.units,
      t = terrain(g.seed).find((t) => t.type === type);
    Object.assign(a, { x: t.x - t.w / 2 - 2, y: t.y });
    Object.assign(b, { x: t.x, y: t.y });
    assert.equal(lineOfSight(g, a, b).clear, true);
    assert.equal(lineOfSight(g, a, b).cover, true);
    Object.assign(b, { x: t.x, y: t.y + t.h / 2 + BASE / 2 + 0.01 });
    assert.equal(lineOfSight(g, a, b).cover, false);
  }
});
test("invalid attacks do not mutate game or consume dice", () => {
  const g = duel(),
    [a, b] = g.units;
  for (const [id, target, action] of [
    [b.id, a.id, "hold"],
    [a.id, a.id, "hold"],
    [a.id, "missing", "hold"],
    [a.id, b.id, "rush"],
    [a.id, b.id, "charge"],
    [a.id, b.id, "bad"],
  ]) {
    const before = structuredClone(g);
    assert.ok(
      resolveAttack(g, id, target, action, () => assert.fail("Must not roll"))
        .error,
    );
    assert.deepEqual(g, before);
  }
  for (const state of ["activated", "shaken", "removed"]) {
    a[state] = true;
    assert.ok(attackCheck(g, a.id, b.id, "hold").error);
    a[state] = false;
  }
  b.removed = true;
  assert.ok(attackCheck(g, a.id, b.id, "hold").error);
  b.removed = false;
  g.ended = true;
  assert.ok(attackCheck(g, a.id, b.id, "hold").error);
});
test("range is inclusive at base edges and shooting into/from melee is rejected", () => {
  const g = duel(),
    [a, b] = g.units;
  b.y = a.y + 24 + BASE;
  assert.equal(attackCheck(g, a.id, b.id, "hold").error, undefined);
  b.y += 0.01;
  assert.match(attackCheck(g, a.id, b.id, "hold").error, /range/);
  b.y = a.y + BASE;
  assert.match(attackCheck(g, a.id, b.id, "hold").error, /melee/);
  b.y = 10;
  g.units.push({ ...a, id: "ally", x: b.x + BASE, y: b.y });
  assert.match(attackCheck(g, a.id, b.id, "hold").error, /melee/);
});
test("shooting records hit/save dice, wounds, activation and turn; cannot shoot twice", () => {
  const g = duel(),
    [a, b] = g.units;
  const result = resolveAttack(g, a.id, b.id, "advance", rolls(4, 3));
  assert.equal(result.strikes.length, 1);
  assert.deepEqual(result.strikes[0].attacks, [4]);
  assert.deepEqual(result.strikes[0].saves, [3]);
  assert.equal(b.wounds, 1);
  assert.equal(woundsLeft(b), 2);
  assert.equal(a.activated, true);
  assert.equal(g.player, 1);
  assert.equal(g.lastCombat.action, "advance");
  assert.ok(resolveAttack(g, a.id, b.id, "advance", rolls()).error);
});
test("natural 1 fails and natural 6 succeeds for hits and saves", () => {
  let g = duel(),
    [a, b] = g.units;
  let result = resolveAttack(g, a.id, b.id, "hold", rolls(1));
  assert.deepEqual(result.strikes[0].saves, []);
  assert.equal(b.wounds, 0);
  g = duel();
  [a, b] = g.units;
  result = resolveAttack(g, a.id, b.id, "hold", rolls(6, 6));
  assert.equal(result.strikes[0].wounds, 0);
  g = duel();
  [a, b] = g.units;
  result = resolveAttack(g, a.id, b.id, "hold", rolls(6, 1));
  assert.equal(result.strikes[0].wounds, 1);
});
test("cover adds +1 Defense only against shooting", () => {
  const g = duel(),
    [a, b] = g.units,
    t = terrain().find((t) => t.type === "wood");
  Object.assign(a, { x: t.x - t.w / 2 - 2, y: t.y });
  Object.assign(b, { x: t.x, y: t.y });
  const result = resolveAttack(g, a.id, b.id, "hold", rolls(6, 3));
  assert.equal(result.strikes[0].cover, true);
  assert.equal(b.wounds, 0);
});
test("charge helper reaches exact contact and uses movement/path rules", () => {
  const g = duel("sword"),
    [a, b] = g.units;
  const point = chargeDestination(a, b);
  assert.ok(Math.abs(distance(point, b) - BASE) < 1e-8);
  assert.equal(moveResult(g, a.id, point, "charge").error, undefined);
  assert.match(moveResult(g, a.id, point, "charge", 10).error, /limit/);
  Object.assign(a, point);
  assert.equal(attackCheck(g, a.id, b.id, "charge").error, undefined);
  assert.ok(moveResult(g, a.id, { x: a.x + 1, y: a.y }, "advance").error);
});
test("surviving defender retaliates in melee without using its activation; both become fatigued", () => {
  const g = duel("sword"),
    [a, b] = g.units;
  b.y = a.y + BASE;
  const result = resolveAttack(
    g,
    a.id,
    b.id,
    "charge",
    rolls(1, 1, 6, 1, 1, 1),
  );
  assert.equal(result.strikes.length, 2);
  assert.equal(result.strikes[0].wounds, 0);
  assert.equal(result.strikes[1].wounds, 1);
  assert.equal(a.removed, true);
  assert.equal(b.activated, false);
  assert.equal(g.player, 1);
  assert.equal(a.fought, true);
  assert.equal(b.fought, true);
  assert.equal(g.firstFinished, 0);
});
test("killed or shaken defenders cannot retaliate; melee cover does not apply", () => {
  for (const shaken of [false, true]) {
    const g = duel("sword"),
      [a, b] = g.units;
    b.kind = "sword";
    b.y = a.y + BASE;
    b.shaken = shaken;
    const result = resolveAttack(
      g,
      a.id,
      b.id,
      "charge",
      shaken ? rolls(1, 1) : rolls(6, 6, 1, 1),
    );
    assert.equal(result.strikes.length, 1);
    assert.equal(result.strikes[0].cover, false);
    assert.equal(b.removed, !shaken);
  }
});
test("rangers switch to melee on Charge; fatigued melee hits on 6 and resets next round", () => {
  const g = duel(),
    [a, b] = g.units;
  b.y = a.y + BASE;
  b.shaken = true;
  a.fought = true;
  const result = resolveAttack(g, a.id, b.id, "charge", rolls(5));
  assert.equal(result.strikes[0].quality, 6);
  assert.equal(result.strikes[0].attacks.length, combatProfile(a).meleeAttacks);
  assert.equal(b.wounds, 0);
  b.activated = true;
  nextRound(g);
  assert.equal(a.fought, false);
  assert.equal(b.fought, false);
});
test("a full combat exchange is JSON-persistable and can be restored by snapshot undo", () => {
  let g = duel();
  const [a, b] = g.units,
    before = structuredClone(g);
  b.kind = "sword";
  resolveAttack(g, a.id, b.id, "hold", rolls(6, 1));
  const restored = JSON.parse(JSON.stringify(g));
  assert.equal(restored.units[1].removed, true);
  assert.equal(restored.lastCombat.strikes[0].wounds, 1);
  g = before;
  assert.equal(g.units[1].removed, false);
  assert.equal(g.lastCombat, undefined);
});

test("cover uses a circular base, not a square expansion at terrain corners", () => {
  const g = duel(),
    [a, b] = g.units,
    t = terrain().find((t) => t.type === "wood");
  Object.assign(a, { x: t.x + 5, y: t.y + 5 });
  Object.assign(b, {
    x: t.x + t.w / 2 + (BASE / 2) * 0.8,
    y: t.y + t.h / 2 + (BASE / 2) * 0.8,
  });
  assert.equal(lineOfSight(g, a, b).cover, false);
  Object.assign(b, {
    x: t.x + t.w / 2 + (BASE / 2) * 0.6,
    y: t.y + t.h / 2 + (BASE / 2) * 0.6,
  });
  assert.equal(lineOfSight(g, a, b).cover, true);
});

test("melee ignores cover even when the defender is inside woods", () => {
  const g = duel("sword"),
    [a, b] = g.units,
    t = terrain().find((t) => t.type === "wood");
  Object.assign(b, { x: t.x, y: t.y, shaken: true });
  Object.assign(a, { x: t.x - BASE, y: t.y });
  assert.equal(lineOfSight(g, a, b).cover, true);
  const result = resolveAttack(g, a.id, b.id, "charge", rolls(6, 6, 3, 3));
  assert.equal(result.strikes[0].cover, false);
  assert.equal(result.strikes[0].wounds, 2);
});
