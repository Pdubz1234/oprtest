export const SIZE = 48;
export const BASE = 32 / 25.4;
export const ACTIONS = { hold: 0, advance: 6, rush: 12, charge: 12 };
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Demo profiles, not official army data. Distances are in battlefield inches.
export function weaponProfile(unit, action = "advance") {
  const ranged = unit.kind === "bow" && action !== "charge";
  return {
    name: ranged ? "Demo bow" : "Melee",
    ranged,
    range: ranged
      ? Number.isFinite(unit.weaponRange) &&
        unit.weaponRange >= 1 &&
        unit.weaponRange <= 48
        ? unit.weaponRange
        : 24
      : 0,
  };
}
export const canActivate = (game, unit) =>
  Boolean(
    unit &&
      !game.ended &&
      unit.team === game.player &&
      !unit.activated &&
      !unit.removed,
  );
export function movementBudget(action, spent = 0, difficult = false) {
  const maximum = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : 0;
  const limit = difficult ? Math.min(6, maximum) : maximum;
  return { limit, remaining: Math.max(0, limit - spent) };
}
export function unitRanges(game, unit, action, spent = 0, difficult = false) {
  if (!unit || unit.removed) return null;
  const weapon = weaponProfile(unit, action);
  const ready = canActivate(game, unit) && !unit.shaken;
  const weaponAvailable =
    ready &&
    (weapon.ranged
      ? ["hold", "advance"].includes(action) && !engaged(game, unit)
      : action === "charge");
  return {
    movement:
      ready && !engaged(game, unit)
        ? movementBudget(action, spent, difficult).remaining
        : 0,
    weapon,
    weaponAvailable,
    // Both bases are 32 mm: this circle marks eligible target CENTERS.
    weaponRadius: weapon.range + BASE,
    targets: weaponAvailable
      ? game.units
          .filter(
            (target) => !attackCheck(game, unit.id, target.id, action).error,
          )
          .map((target) => target.id)
      : [],
  };
}
export function terrain(seed = 1) {
  const pieces = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 4; col++) {
      const n = row * 4 + col;
      const type = ["wood", "ruin", "rock", "wood", "scrub"][(n + seed) % 5];
      pieces.push({
        id: n,
        type,
        x: 14 + col * 6 + Math.sin(n * 3 + seed) * 1.2,
        y: 4 + row * 9 + Math.cos(n * 5 + seed) * 1.5,
        w: type === "wood" ? 4 : 2.7,
        h: type === "wood" ? 4.2 : 2.6,
      });
    }
  return pieces;
}
export function createGame(seed = 1) {
  return {
    version: 1,
    seed,
    round: 1,
    player: 0,
    firstFinished: null,
    ended: false,
    units: [0, 1].flatMap((team) =>
      [
        "Captain",
        "Blade I",
        "Blade II",
        "Ranger I",
        "Ranger II",
        "Guardian",
      ].map((name, i) => ({
        id: `${team}-${i}`,
        team,
        name,
        kind: i === 0 ? "hero" : i > 2 && i < 5 ? "bow" : "sword",
        x: team ? 41 : 7,
        y: 8 + i * 6.4,
        activated: false,
        shaken: false,
        removed: false,
      })),
    ),
    objectives: [
      { id: 1, x: 24, y: 12, owner: null },
      { id: 2, x: 24, y: 24, owner: null },
      { id: 3, x: 24, y: 36, owner: null },
    ],
    log: ["Battlefield ready. Azure activates first."],
  };
}
const inside = (p, t, margin = 0) =>
  Math.abs(p.x - t.x) <= t.w / 2 + margin &&
  Math.abs(p.y - t.y) <= t.h / 2 + margin;
export function moveResult(
  game,
  id,
  target,
  action,
  spent = 0,
  difficultUsed = false,
) {
  const unit = game.units.find((u) => u.id === id);
  if (
    !unit ||
    unit.removed ||
    unit.team !== game.player ||
    unit.activated ||
    game.ended
  )
    return { error: "Select an available miniature from the active warband." };
  if (unit.shaken)
    return { error: "Shaken miniatures must recover without moving." };
  if (engaged(game, unit) && distance(unit, target) > 0.001)
    return {
      error:
        "In base contact: choose Charge to fight, or resolve disengagement manually.",
    };
  if (!Object.hasOwn(ACTIONS, action)) return { error: "Choose an action." };
  if (
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    target.x < BASE / 2 ||
    target.y < BASE / 2 ||
    target.x > SIZE - BASE / 2 ||
    target.y > SIZE - BASE / 2
  )
    return { error: "Keep the whole base on the battlefield." };
  const length = distance(unit, target);
  let difficult = false;
  for (let i = 0; i <= Math.ceil(length * 8); i++) {
    const fraction = length ? i / Math.ceil(length * 8) : 0;
    const p = {
      x: unit.x + (target.x - unit.x) * fraction,
      y: unit.y + (target.y - unit.y) * fraction,
    };
    for (const t of terrain(game.seed)) {
      if (inside(p, t, BASE / 2) && ["rock", "ruin"].includes(t.type))
        return {
          error: "That path is blocked. Move around the rocks or ruins.",
        };
      if (inside(p, t, BASE / 2) && ["wood", "scrub"].includes(t.type))
        difficult = true;
    }
  }
  const { limit } = movementBudget(action, 0, difficult || difficultUsed);
  if (length + spent > limit + 0.001)
    return {
      error: `${difficult ? "Difficult terrain: " : ""}${limit}″ total movement limit. Undo to choose another path.`,
    };
  for (const other of game.units.filter((u) => u.id !== id && !u.removed)) {
    // Prevent moving through other bases, not just overlapping at the destination.
    const dx = target.x - unit.x,
      dy = target.y - unit.y;
    const t = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((other.x - unit.x) * dx + (other.y - unit.y) * dy) /
              (length * length),
          ),
        )
      : 0;
    const closest = { x: unit.x + dx * t, y: unit.y + dy * t };
    const clearance =
      other.team === unit.team || action === "charge" ? BASE : BASE + 1;
    if (distance(closest, other) < clearance - 0.001)
      return {
        error:
          other.team === unit.team
            ? "Another miniature blocks that path."
            : "Stay 1″ from enemy bases unless charging.",
      };
  }
  return { length, difficult };
}
export function finishActivation(game, id) {
  const unit = game.units.find((u) => u.id === id);
  if (
    !unit ||
    unit.removed ||
    unit.activated ||
    unit.team !== game.player ||
    game.ended
  )
    return false;
  unit.activated = true;
  unit.shaken = false;
  passTurn(game);
  return true;
}
export const roundComplete = (game) =>
  game.units.filter((u) => !u.removed).every((u) => u.activated);
export function nextRound(game) {
  if (game.ended || !roundComplete(game)) return false;
  for (const obj of game.objectives) {
    const nearby = game.units.filter(
      (u) => !u.removed && !u.shaken && distance(u, obj) <= 3 + BASE / 2,
    );
    const teams = new Set(nearby.map((u) => u.team));
    if (teams.size === 2) obj.owner = null;
    else if (teams.size === 1) obj.owner = nearby[0].team;
  }
  if (game.round === 4) game.ended = true;
  else {
    game.round++;
    game.player = game.firstFinished ?? 0;
    game.firstFinished = null;
    game.units.forEach((u) => {
      u.activated = false;
      u.fought = false;
    });
  }
  return true;
}
export const score = (game, team) =>
  game.objectives.filter((o) => o.owner === team).length;

// Demo combat, deliberately separate from official army profiles/injury rules.
export function combatProfile(unit) {
  return {
    quality: unit.kind === "hero" ? 3 : 4,
    defense: unit.name === "Guardian" ? 3 : 4,
    meleeAttacks: unit.kind === "hero" ? 3 : unit.kind === "sword" ? 2 : 1,
    rangedAttacks: unit.kind === "bow" ? 1 : 0,
    toughness: unit.kind === "hero" ? 3 : 1,
  };
}
export const woundsLeft = (unit) =>
  Math.max(0, combatProfile(unit).toughness - (unit.wounds || 0));
export const engaged = (game, unit) =>
  game.units.some(
    (other) =>
      !other.removed &&
      other.team !== unit.team &&
      distance(unit, other) <= BASE + 0.001,
  );

// Slab intersection, including tangents: no sampling can skip a thin blocker.
export function segmentIntersectsRect(a, b, rect) {
  let low = 0,
    high = 1;
  for (const [axis, size] of [
    ["x", "w"],
    ["y", "h"],
  ]) {
    const delta = b[axis] - a[axis];
    const min = rect[axis] - rect[size] / 2,
      max = rect[axis] + rect[size] / 2;
    if (Math.abs(delta) < 1e-10) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const t1 = (min - a[axis]) / delta,
        t2 = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (low > high) return false;
    }
  }
  return true;
}
export function lineOfSight(game, attacker, target) {
  const pieces = terrain(game.seed);
  const blocker = pieces.find(
    (piece) =>
      ["rock", "ruin"].includes(piece.type) &&
      segmentIntersectsRect(attacker, target, piece),
  );
  if (blocker)
    return {
      clear: false,
      cover: false,
      reason: `Blocked by ${blocker.type}.`,
    };
  const dx = target.x - attacker.x,
    dy = target.y - attacker.y;
  const length2 = dx * dx + dy * dy;
  const model = game.units.find((u) => {
    if (u.removed || u.id === attacker.id || u.id === target.id) return false;
    const t = length2
      ? ((u.x - attacker.x) * dx + (u.y - attacker.y) * dy) / length2
      : 0;
    return (
      t > 0 &&
      t < 1 &&
      distance(u, { x: attacker.x + t * dx, y: attacker.y + t * dy }) <=
        BASE / 2
    );
  });
  if (model)
    return { clear: false, cover: false, reason: `Blocked by ${model.name}.` };
  // Simplified 2D cover: target base overlaps woodland/brush footprint.
  const cover = pieces.some(
    (piece) =>
      ["wood", "scrub"].includes(piece.type) &&
      Math.hypot(
        Math.max(0, Math.abs(target.x - piece.x) - piece.w / 2),
        Math.max(0, Math.abs(target.y - piece.y) - piece.h / 2),
      ) <=
        BASE / 2,
  );
  return {
    clear: true,
    cover,
    reason: cover
      ? "Clear line of sight · cover (+1 shooting Defense)."
      : "Clear line of sight · no cover.",
  };
}
export function attackCheck(game, attackerId, targetId, action) {
  const attacker = game.units.find((u) => u.id === attackerId);
  const target = game.units.find((u) => u.id === targetId);
  if (!canActivate(game, attacker))
    return { error: "Select an available attacker from the active warband." };
  if (attacker.shaken)
    return { error: "Shaken units must recover, not attack." };
  if (!target || target.removed || target.team === attacker.team)
    return { error: "Select a living enemy target." };
  const weapon = weaponProfile(attacker, action);
  const gap = Math.max(0, distance(attacker, target) - BASE);
  const sight = lineOfSight(game, attacker, target);
  const info = { gap, sight, melee: !weapon.ranged, weapon };
  if (weapon.ranged) {
    if (!["hold", "advance"].includes(action))
      return { ...info, error: "Shooting requires Hold or Advance." };
    if (engaged(game, attacker) || engaged(game, target))
      return { ...info, error: "Cannot shoot while engaged or into melee." };
    if (gap > weapon.range + 0.001)
      return { ...info, error: "Target is outside weapon range." };
  } else {
    if (action !== "charge")
      return {
        ...info,
        error: "Choose Charge for melee (including units already in contact).",
      };
    if (gap > 0.001)
      return {
        ...info,
        error: "Melee requires base contact. Move to contact first.",
      };
  }
  if (!sight.clear) return { ...info, error: sight.reason };
  return info;
}
export function chargeDestination(attacker, target) {
  const length = distance(attacker, target);
  if (length <= BASE) return { x: attacker.x, y: attacker.y };
  return {
    x: target.x + ((attacker.x - target.x) * BASE) / length,
    y: target.y + ((attacker.y - target.y) * BASE) / length,
  };
}
export const testRoll = (roll, threshold, bonus = 0) =>
  roll === 6 || (roll !== 1 && roll + bonus >= threshold);
function strike(attacker, target, melee, cover, roll) {
  const profile = combatProfile(attacker),
    defense = combatProfile(target).defense;
  const count = melee ? profile.meleeAttacks : profile.rangedAttacks;
  const quality = melee && attacker.fought ? 6 : profile.quality;
  const attacks = Array.from({ length: count }, roll);
  const hits = attacks.filter((value) => testRoll(value, quality)).length;
  const saves = Array.from({ length: hits }, roll);
  const wounds = saves.filter(
    (value) => !testRoll(value, defense, cover ? 1 : 0),
  ).length;
  target.wounds = (target.wounds || 0) + wounds;
  if (woundsLeft(target) === 0) target.removed = true;
  if (melee) attacker.fought = true;
  return {
    attacker: attacker.id,
    target: target.id,
    attacks,
    quality,
    saves,
    defense,
    cover,
    wounds,
    removed: target.removed,
  };
}
function passTurn(game) {
  const available = (team) =>
    game.units.some((u) => u.team === team && !u.activated && !u.removed);
  if (!available(game.player) && game.firstFinished === null)
    game.firstFinished = game.player;
  if (available(1 - game.player)) game.player = 1 - game.player;
}
export function resolveAttack(game, attackerId, targetId, action, roll) {
  const check = attackCheck(game, attackerId, targetId, action);
  if (check.error) return check;
  const attacker = game.units.find((u) => u.id === attackerId),
    target = game.units.find((u) => u.id === targetId);
  const strikes = [
    strike(
      attacker,
      target,
      check.melee,
      !check.melee && check.sight.cover,
      roll,
    ),
  ];
  if (check.melee && !target.removed && !target.shaken)
    strikes.push(strike(target, attacker, true, false, roll));
  attacker.activated = true;
  passTurn(game);
  game.lastCombat = { round: game.round, action, strikes };
  return { ...check, strikes };
}
