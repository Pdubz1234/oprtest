export const SIZE = 48;
export const BASE = 32 / 25.4;
export const ACTIONS = { hold: 0, advance: 6, rush: 12, charge: 12 };
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Demo profiles, not official army data. Distances are in battlefield inches.
export function weaponProfile(unit) {
  const ranged = unit.kind === "bow";
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
  const weapon = weaponProfile(unit);
  const ready = canActivate(game, unit) && !unit.shaken;
  const weaponAvailable =
    ready &&
    (weapon.ranged
      ? ["hold", "advance"].includes(action)
      : action === "charge");
  return {
    movement: ready ? movementBudget(action, spent, difficult).remaining : 0,
    weapon,
    weaponAvailable,
    // Both bases are 32 mm: this circle marks eligible target CENTERS.
    weaponRadius: weapon.range + BASE,
    targets: weaponAvailable
      ? game.units
          .filter(
            (target) =>
              !target.removed &&
              target.team !== unit.team &&
              distance(unit, target) <= weapon.range + BASE + 0.001,
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
  const available = (team) =>
    game.units.some((u) => u.team === team && !u.activated && !u.removed);
  if (!available(game.player) && game.firstFinished === null)
    game.firstFinished = game.player;
  if (available(1 - game.player)) game.player = 1 - game.player;
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
    game.units.forEach((u) => (u.activated = false));
  }
  return true;
}
export const score = (game, team) =>
  game.objectives.filter((o) => o.owner === team).length;
