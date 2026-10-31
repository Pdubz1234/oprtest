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
  canActivate as rulesCanActivate,
  movementBudget,
  unitRanges,
  weaponProfile,
  combatProfile,
  woundsLeft,
  lineOfSight,
  attackCheck,
  resolveAttack,
  chargeDestination,
} from "./game.js";
import {
  defaultCamera,
  viewToWorld,
  zoomCamera,
  cameraTransform,
} from "./camera.js";
const $ = (id) => document.getElementById(id);
const TEAMS = ["Azure Covenant", "Ember Clans"];
const SHORT = ["Azure", "Ember"];
const COLORS = ["#6fa6be", "#d29a7e"];
const ICONS = Object.fromEntries(
  ["hero", "sword", "bow"].map((kind) => [
    kind,
    `<svg viewBox="-16 -16 32 32" width="24" height="24" aria-hidden="true">${figure(kind)}</svg>`,
  ]),
);
const STORAGE = "war-table-v1";
let game = createGame(),
  selected = null,
  action = "advance",
  spent = 0,
  difficultUsed = false,
  history = [],
  grid = true,
  zones = false,
  measuring = false,
  measurePoints = [],
  timer;
let camera = defaultCamera(),
  panning = false,
  drag = null,
  suppressClick = false;
let targetId = null,
  aiming = false;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (
    saved?.game?.version === 1 &&
    Array.isArray(saved.game.units) &&
    saved.game.units.length === 12 &&
    saved.game.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y))
  ) {
    game = saved.game;
    selected = saved.selected;
    action = saved.action in ACTIONS ? saved.action : "advance";
    spent = Number(saved.spent) || 0;
    difficultUsed = Boolean(saved.difficultUsed);
  }
} catch {
  /* A blocked or unavailable local store must not prevent play. */
}
function save() {
  try {
    localStorage.setItem(
      STORAGE,
      JSON.stringify({ game, selected, action, spent, difficultUsed }),
    );
    $("save-status").textContent = "● Saved on this device";
  } catch {
    $("save-status").textContent = "○ Saving unavailable";
  }
}
function snapshot() {
  history.push(
    structuredClone({ game, selected, action, spent, difficultUsed }),
  );
  if (history.length > 60) history.shift();
}
function log(text) {
  game.log.unshift(text);
  game.log = game.log.slice(0, 40);
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  clearTimeout(timer);
  timer = setTimeout(() => $("toast").classList.remove("visible"), 4300);
}
const unit = () => game.units.find((u) => u.id === selected);
const canActivate = (u) => rulesCanActivate(game, u);
const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function choose(id) {
  if (id === selected) return;
  if (spent > 0 && id !== selected) {
    toast(
      "End this activation or undo movement before selecting another miniature.",
    );
    return;
  }
  selected = id;
  targetId = null;
  aiming = false;
  action = "advance";
  spent = 0;
  difficultUsed = false;
  measurePoints = [];
  render();
  document
    .querySelector(`#board [data-unit="${selected}"]`)
    ?.focus({ preventScroll: true });
}
function tree(x, y, s = 1, r = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><ellipse cx="5" cy="13" rx="26" ry="22" fill="#354c3c" opacity=".3"/><path d="M-2 5L2 34" stroke="#646848" stroke-width="7"/><path d="M0-33L-25 6L-12 4L-29 24L27 24L14 5L24 7Z" fill="#4b6750" stroke="#425a46" stroke-width="2"/><path d="M0-33L-19 5L-7 3L-20 19L0 16Z" fill="#6d8559"/><path d="M2-22L17 6L6 3L18 17" fill="none" stroke="#779063" stroke-width="2" opacity=".5"/></g>`;
}
function terrainSvg(t) {
  const x = t.x * 20,
    y = t.y * 20;
  const title =
    t.type === "wood"
      ? "Woodland: cover and difficult terrain"
      : t.type === "scrub"
        ? "Brush: cover and difficult terrain"
        : t.type === "ruin"
          ? "Ruins: impassable sight blocker (prototype)"
          : "Rocks: impassable sight blocker (prototype)";
  let art = "";
  if (t.type === "wood")
    art = `<ellipse rx="47" ry="49" fill="#5c7450" opacity=".4"/><ellipse rx="39" ry="40" fill="#697d52" opacity=".7"/>${tree(-20, 8, 0.85, -8)}${tree(19, 2, 0.95, 7)}${tree(-4, -18, 1.1, 0)}<circle cx="-22" cy="33" r="7" fill="#8d986a"/>`;
  if (t.type === "scrub")
    art =
      '<ellipse rx="33" ry="30" fill="#9a9e67" opacity=".35"/><path d="M-25 13q-8-23 9-25q6-19 17-6q18-11 21 4q16 9 2 23q-26 13-49 4" fill="#6d8055"/><path d="M-17 11l7-17M-2 10l3-20M10 14l9-14" stroke="#a1aa72" stroke-width="3" opacity=".5"/>';
  if (t.type === "rock")
    art =
      '<ellipse cx="5" cy="8" rx="35" ry="28" fill="#45503b" opacity=".25"/><path d="M-28 6L-18-20L4-28L28-9L31 12L9 26L-17 20Z" fill="#9b9d86" stroke="#777f6c" stroke-width="2"/><path d="M-18-20L0-8L28-9L4-28Z" fill="#b4b39b"/><path d="M0-8L9 26L31 12L28-9Z" fill="#838a76"/><path d="M-28 6L0-8L9 26L-17 20Z" fill="#a3a48c"/><path d="M-35 22L-28 12L-19 21L-23 30Z" fill="#b1af95"/>';
  if (t.type === "ruin")
    art =
      '<ellipse cx="6" cy="9" rx="39" ry="31" fill="#43503a" opacity=".25"/><path d="M-29 25V-22H-17V11H28V25Z" fill="#737a66"/><path d="M-32 17V-29H-19V4H25V17Z" fill="#b5b49b" stroke="#828974" stroke-width="2"/><path d="M-32-29L-26-35L-19-29M-33-13H-20M-33 0H-20M-16 4V17M0 4V17M15 4V17" fill="none" stroke="#858b75" stroke-width="2"/><path d="M8-11L20-15L26-7L15-3Z" fill="#a8aa91"/><path d="M-8-19L0-22L6-14L-4-9Z" fill="#929a7c"/>';
  return `<g transform="translate(${x} ${y})"><title>${title}</title>${art}</g>`;
}
function figure(kind) {
  const common =
    '<circle cy="-6" r="4" fill="currentColor"/><path d="M-4-1L-6 8L5 8L4-1Z" fill="currentColor"/>';
  if (kind === "bow")
    return (
      common +
      '<path d="M6-9Q18 0 6 10M7-8V9M-6 1H13" stroke="currentColor" fill="none" stroke-width="2"/>'
    );
  if (kind === "hero")
    return (
      common +
      '<path d="M-8 9V-13M-8-12H1L-3-7H-8" stroke="currentColor" fill="none" stroke-width="2"/>'
    );
  return (
    common +
    '<path d="M9 9V-13M5-3H13M-9-3L-12 5L-7 9L-4 5V-3Z" stroke="currentColor" fill="none" stroke-width="2"/>'
  );
}
function drawBoard() {
  const u = unit(),
    ranges = unitRanges(game, u, action, spent, difficultUsed);
  let art = `<defs><radialGradient id="ground"><stop stop-color="#a4b28a"/><stop offset=".7" stop-color="#92a77b"/><stop offset="1" stop-color="#788f65"/></radialGradient><pattern id="grid" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0H0V120" fill="none" stroke="#e1e9cd" stroke-width="1" opacity=".24"/></pattern><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".45" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".1"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter><filter id="shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#263c30" flood-opacity=".45"/></filter></defs><rect width="960" height="960" fill="url(#ground)"/><g opacity=".7"><path d="M-60 820Q240 730 407 485T1020 110" fill="none" stroke="#b7b991" stroke-width="87"/><path d="M-60 820Q240 730 407 485T1020 110" fill="none" stroke="#c0bf98" stroke-width="54" opacity=".5"/></g><rect width="960" height="960" fill="#9eab84" filter="url(#grain)" opacity=".25"/>`;
  for (let i = 0; i < 110; i++) {
    const x = (Math.sin(i * 43.13) * 0.5 + 0.5) * 960,
      y = (Math.cos(i * 27.7) * 0.5 + 0.5) * 960;
    art += `<path d="M${x - 3} ${y + 3}l2-7m1 6l4-6" stroke="${i % 2 ? "#b7c097" : "#6f8759"}" stroke-width="1.5" opacity=".4"/>`;
  }
  if (grid)
    art +=
      '<rect width="960" height="960" fill="url(#grid)" pointer-events="none"/>';
  if (zones)
    art +=
      '<rect width="240" height="960" fill="#6695af" opacity=".17"/><rect x="720" width="240" height="960" fill="#cc9474" opacity=".17"/><path d="M240 0V960M720 0V960" stroke="#e3eacb" stroke-dasharray="9 8" opacity=".6"/><text transform="translate(27 520) rotate(-90)" fill="#d8e8dc" font-size="14" letter-spacing="5">AZURE DEPLOYMENT · 12″</text><text transform="translate(935 400) rotate(90)" fill="#f2dfc5" font-size="14" letter-spacing="5">EMBER DEPLOYMENT · 12″</text>';
  art += terrain(game.seed).map(terrainSvg).join("");
  for (const obj of game.objectives) {
    const c = obj.owner === null ? "#e6db9b" : COLORS[obj.owner];
    art += `<g transform="translate(${obj.x * 20} ${obj.y * 20})"><title>Objective ${obj.id}: ${obj.owner === null ? "neutral" : SHORT[obj.owner]}</title><circle r="60" fill="${c}" fill-opacity=".05" stroke="${c}" stroke-width="1" stroke-opacity=".5" stroke-dasharray="5 7"/><rect x="-14" y="-14" width="28" height="28" rx="3" transform="rotate(45)" fill="#526143" stroke="${c}" stroke-width="2"/><text text-anchor="middle" y="5" fill="${c}" font-size="14" font-family="Georgia">${obj.id}</text></g>`;
  }
  if (ranges && !measuring) {
    if (ranges.movement > 0)
      art += `<circle class="movement-range" cx="${u.x * 20}" cy="${u.y * 20}" r="${ranges.movement * 20}" fill="#c8efbd" fill-opacity=".12" stroke="#def8c7" stroke-width="2" stroke-dasharray="6 7" pointer-events="none"/>`;
    art += `<circle class="weapon-range" cx="${u.x * 20}" cy="${u.y * 20}" r="${ranges.weaponRadius * 20}" fill="none" stroke="#ffd393" stroke-opacity="${ranges.weaponAvailable ? 0.95 : 0.4}" stroke-width="2.5" stroke-dasharray="12 6" pointer-events="none"/>`;
  }
  if (measurePoints.length) {
    const a = measurePoints[0];
    art += `<circle cx="${a.x * 20}" cy="${a.y * 20}" r="5" fill="#f2efc7"/>`;
    if (measurePoints.length === 2) {
      const b = measurePoints[1];
      art += `<path d="M${a.x * 20} ${a.y * 20}L${b.x * 20} ${b.y * 20}" stroke="#f2efc7" stroke-width="2" stroke-dasharray="8 5"/><circle cx="${b.x * 20}" cy="${b.y * 20}" r="5" fill="#f2efc7"/><text x="${(a.x + b.x) * 10}" y="${(a.y + b.y) * 10 - 12}" text-anchor="middle" fill="#fffce0" stroke="#40523a" stroke-width="3" paint-order="stroke" font-size="18">${distance(a, b).toFixed(1)}″</text>`;
    }
  }
  const target = game.units.find((m) => m.id === targetId && !m.removed);
  if (u && !u.removed && target && !measuring) {
    const sight = lineOfSight(game, u, target);
    art += `<path class="sight-line" d="M${u.x * 20} ${u.y * 20}L${target.x * 20} ${target.y * 20}" stroke="${sight.clear ? "#f9dc91" : "#f4897c"}" stroke-width="3" stroke-dasharray="9 5" pointer-events="none"><title>${esc(sight.reason)}</title></path>`;
  }
  for (const m of game.units.filter((m) => !m.removed)) {
    const isSelected = m.id === selected,
      r = BASE * 10;
    art += `<g class="miniature" data-unit="${m.id}" role="button" tabindex="0" aria-label="${esc(SHORT[m.team] + " " + m.name + (m.activated ? ", activated" : "") + (m.shaken ? ", shaken" : ""))}" transform="translate(${m.x * 20} ${m.y * 20})" style="color:${m.team ? "#ffe0c0" : "#d8f0ef"};opacity:${m.activated ? 0.6 : 1}"><title>${esc(SHORT[m.team] + " " + m.name)} · 32 mm base</title>${ranges?.targets.includes(m.id) ? `<circle class="range-target" r="${r + 10}" fill="none" stroke="#ffd393" stroke-width="3"><title>Legal attack target: range and line of sight checked</title></circle>` : ""}${isSelected ? `<circle r="${r + 6}" fill="none" stroke="#f3ebc3" stroke-width="2"/><path d="M-4-25L0-20L4-25" fill="#f3ebc3"/>` : ""}<circle class="base" r="${r}" fill="${m.team ? "#785345" : "#3d6375"}" stroke="${COLORS[m.team]}" stroke-width="2" filter="url(#shadow)"/>${figure(m.kind)}${m.wounds ? `<text y="32" text-anchor="middle" fill="#fff4d9" stroke="#40523a" stroke-width="2" paint-order="stroke" font-size="14">${woundsLeft(m)} HP</text>` : ""}${m.shaken ? '<text x="12" y="-11" fill="#ffe0a1" font-weight="bold" font-size="17">!</text>' : ""}${m.activated ? '<text x="12" y="-11" fill="#eaf2d5" font-size="16">✓</text>' : ""}</g>`;
  }
  $("board").innerHTML =
    `<g id="camera"><clipPath id="battlefield-clip"><rect width="960" height="960"/></clipPath><g clip-path="url(#battlefield-clip)">${art}</g></g>`;
  updateCamera();
  $("board").classList.toggle("measure-mode", measuring);
}
function render() {
  $("turn-label").textContent = game.ended
    ? "Battle complete"
    : `${SHORT[game.player]}’s turn`;
  $("phase-label").textContent = game.ended
    ? `${score(game, 0)} – ${score(game, 1)} objectives`
    : "Alternating activations";
  $("round-progress").innerHTML =
    `<span>ROUND</span>${[1, 2, 3, 4].map((r) => `<span class="round-chip ${r === game.round ? "current" : r < game.round ? "past" : ""}">${r}</span>`).join("")}`;
  $("next-round").disabled = !roundComplete(game) || game.ended;
  $("next-round").textContent =
    game.round === 4 ? "Finish battle →" : "Next round →";
  $("rosters").innerHTML = [0, 1]
    .map(
      (team) =>
        `<section class="roster-group ${team ? "red" : ""}"><div class="team-heading"><span class="team-dot ${team ? "red" : ""}"></span><strong>${TEAMS[team]}</strong><span class="team-count">${game.units.filter((u) => u.team === team && !u.removed).length} / 6</span></div>${game.units
          .filter((u) => u.team === team)
          .map(
            (u) =>
              `<button class="unit-row ${u.id === selected ? "selected" : ""} ${u.activated ? "used" : ""} ${u.removed ? "removed" : ""}" data-unit="${u.id}" ${u.removed ? "disabled" : ""} aria-pressed="${u.id === selected}" aria-label="${SHORT[team]} ${u.name}${u.activated ? ", activated" : ""}${u.shaken ? ", shaken" : ""}"><span class="unit-avatar">${ICONS[u.kind]}</span><span>${u.name}${u.wounds ? ` · ${woundsLeft(u)} HP` : ""}</span><span class="unit-state ${!u.shaken && !u.activated ? "ready" : ""}">${u.shaken ? "!" : u.activated ? "✓" : ""}</span></button>`,
          )
          .join("")}</section>`,
    )
    .join("");
  $("objective-list").innerHTML = game.objectives
    .map(
      (o) =>
        `<div class="objective-row"><span class="objective-number"><span>${o.id}</span></span><span>Crossing ${["North", "Center", "South"][o.id - 1]}</span><span class="objective-owner">${o.owner === null ? "Neutral" : SHORT[o.owner]}</span></div>`,
    )
    .join("");
  const u = unit(),
    available = canActivate(u);
  $("selection-tag").textContent = u ? "32 MM BASE" : "SELECT A UNIT";
  $("selected-info").innerHTML = u
    ? `<div class="selection-card ${u.team ? "red" : ""}"><span class="unit-avatar">${ICONS[u.kind]}</span><div><h3>${u.name}</h3><p>${TEAMS[u.team]} · ${u.shaken ? "Shaken" : u.activated ? "Activated" : "Ready"}</p></div></div>`
    : '<div class="empty-selection">Your warband awaits.<br>Select a miniature to make your move.</div>';
  const details = {
    hold: ["•", "Hold", "Can shoot"],
    advance: ["→", "Advance", "Move + shoot"],
    rush: ["»", "Rush", "No shooting"],
    charge: [ICONS.sword, "Charge", "Move into melee"],
  };
  $("actions").innerHTML = Object.keys(ACTIONS)
    .map(
      (a) =>
        `<button class="action-button ${action === a ? "active" : ""}" data-action="${a}" aria-pressed="${action === a}" ${!available || u?.shaken || spent > 0 ? "disabled" : ""}>${details[a][0]}<span class="distance">${ACTIONS[a]}″</span><strong>${details[a][1]}</strong><small>${details[a][2]}</small></button>`,
    )
    .join("");
  const { limit } = movementBudget(action, spent, difficultUsed);
  $("movement-used").textContent =
    `${spent.toFixed(spent % 1 ? 1 : 0)}″ / ${limit}″`;
  $("movement-fill").style.width =
    `${limit ? Math.min(100, (spent / limit) * 100) : 0}%`;
  const ranges = unitRanges(game, u, action, spent, difficultUsed);
  $("range-readout").textContent = ranges
    ? `Movement upper bound: ${ranges.movement.toFixed(1)}″ remaining · ${ranges.weapon.name}: ${ranges.weapon.range || "base contact"}${ranges.weapon.range ? "″" : ""}${ranges.weaponAvailable ? "" : " (unavailable for this activation/action)"}. ${ranges.targets.length} legal attack targets (range + line of sight).`
    : "Select a unit to see movement and weapon ranges.";
  $("weapon-range-input").disabled =
    !u || u.removed || u.kind !== "bow" || game.ended;
  $("weapon-range-input").value =
    u?.kind === "bow" ? weaponProfile(u).range : "";
  $("action-help").textContent = u?.shaken
    ? "Recovery: end this activation without moving to clear Shaken."
    : action === "charge"
      ? "Choose an enemy, move to contact, then resolve melee. Surviving unshaken defenders strike back."
      : "Click to move, then select a combat target. Resolve attack rolls dice and ends the activation.";
  $("finish-button").disabled = !available;
  $("finish-button").innerHTML = u?.shaken
    ? "Recover & end activation <span>→</span>"
    : "End activation <span>→</span>";
  $("shaken-button").disabled = !u || u.removed || game.ended || spent > 0;
  $("shaken-button").textContent = u?.shaken ? "Clear shaken" : "Mark shaken";
  $("remove-button").disabled = !u || u.removed || game.ended;
  $("undo-button").disabled = !history.length;
  $("battle-log").innerHTML = game.log
    .slice(0, 8)
    .map((s) => `<li>${esc(s)}</li>`)
    .join("");
  $("board-hint").textContent = game.ended
    ? `Final control: Azure ${score(game, 0)} · Ember ${score(game, 1)}. ${score(game, 0) === score(game, 1) ? "The battle is a draw." : `${SHORT[score(game, 0) > score(game, 1) ? 0 : 1]} wins!`}`
    : aiming
      ? "Targeting mode: click an enemy to inspect sight and combat eligibility. Resolve in the Combat panel."
      : measuring
        ? "Ruler active: click two points to measure center-to-center distance."
        : roundComplete(game)
          ? "All miniatures have activated. Advance the round to resolve objectives."
          : available
            ? `${u.name} selected · ${u.shaken ? "End activation to recover." : `Choose an action, then click to move. Arrow keys move 1″.`}`
            : `Select an available ${SHORT[game.player]} miniature to begin your activation.`;
  renderCombat();
  drawBoard();
  save();
}
function renderCombat() {
  const u = unit();
  const enemies =
    u && !u.removed
      ? game.units.filter((v) => v.team !== u.team && !v.removed)
      : [];
  if (!enemies.some((v) => v.id === targetId)) {
    const legal = enemies.find(
      (v) => !attackCheck(game, u.id, v.id, action).error,
    );
    targetId = (legal || enemies[0])?.id ?? null;
  }
  const target = enemies.find((v) => v.id === targetId);
  $("combat-target").innerHTML =
    '<option value="">Select enemy</option>' +
    enemies
      .map(
        (v) =>
          `<option value="${v.id}" ${v.id === targetId ? "selected" : ""}>${esc(SHORT[v.team] + " " + v.name)} · ${woundsLeft(v)} HP</option>`,
      )
      .join("");
  $("combat-target").disabled = !enemies.length;
  $("aim-button").disabled = !u || u.removed || !enemies.length;
  if (!u || u.removed) aiming = false;
  $("aim-button").setAttribute("aria-pressed", aiming);
  $("aim-button").textContent = aiming
    ? "Targeting on: pick enemy on map"
    : "Pick target on map";
  const profile = u ? combatProfile(u) : null;
  $("combat-profile").textContent = profile
    ? `Demo profile · Q${profile.quality}+ · D${profile.defense}+ · ${profile.meleeAttacks} melee / ${profile.rangedAttacks} bow attacks · ${woundsLeft(u)}/${profile.toughness} HP. Repeated melee this round: ${u.fought ? "fatigued (hits on 6)" : "fresh"}.`
    : "Select a unit. Profiles are demo values, not official army data.";
  const check = attackCheck(game, u?.id, targetId, action);
  const sight = u && target ? lineOfSight(game, u, target) : null;
  $("sight-status").textContent = sight
    ? `${Math.max(0, distance(u, target) - BASE).toFixed(1)}″ base-edge distance · ${sight.reason} Target: Q${combatProfile(target).quality}+ / D${combatProfile(target).defense}+, ${woundsLeft(target)} HP.`
    : "Select an enemy to inspect line of sight.";
  $("attack-status").textContent =
    check.error ||
    `Ready: ${check.melee ? "melee with possible retaliation" : "shooting"}. Resolving ends this activation.`;
  $("attack-button").disabled = Boolean(check.error);
  $("attack-button").textContent = check.melee
    ? "Resolve melee & end activation"
    : "Shoot & end activation";
  let chargeError = true;
  if (canActivate(u) && !u.shaken && action === "charge" && target) {
    const point = chargeDestination(u, target);
    const move = moveResult(game, u.id, point, action, spent, difficultUsed);
    chargeError = Boolean(move.error) || move.length < 0.01;
    if (move.error)
      $("attack-status").textContent += ` Straight charge path: ${move.error}`;
  }
  $("contact-button").disabled = chargeError;
  $("combat-report").innerHTML = game.lastCombat
    ? `<h3>Last combat · round ${game.lastCombat.round}</h3>` +
      game.lastCombat.strikes
        .map((s) => {
          const attacker = game.units.find((v) => v.id === s.attacker),
            defender = game.units.find((v) => v.id === s.target);
          return `<p>${esc(SHORT[attacker.team] + " " + attacker.name)} → ${esc(SHORT[defender.team] + " " + defender.name)}<br>Hit dice [${s.attacks.join(", ")}] at ${s.quality}+; saves [${s.saves.join(", ") || "none"}] at ${s.defense}+${s.cover ? " (+1 cover)" : ""}. <strong>${s.wounds} wound(s)${s.removed ? " · removed" : ""}</strong>.</p>`;
        })
        .join("")
    : "No combat resolved yet. Natural 1 fails; natural 6 succeeds. Cover adds +1 to shooting saves. Demo damage removes units at 0 HP; official injury/morale rules remain manual.";
}
function pickMiniature(id) {
  const candidate = game.units.find((v) => v.id === id);
  if (
    aiming &&
    unit() &&
    candidate &&
    candidate.team !== unit().team &&
    !candidate.removed
  ) {
    targetId = id;
    render();
  } else choose(id);
}
$("combat-target").onchange = () => {
  targetId = $("combat-target").value;
  render();
};
$("aim-button").onclick = () => {
  aiming = !aiming;
  render();
};
$("contact-button").onclick = () => {
  const target = game.units.find((v) => v.id === targetId && !v.removed);
  if (!unit() || !target || action !== "charge") return;
  moveTo(chargeDestination(unit(), target));
};
$("attack-button").onclick = () => {
  const check = attackCheck(game, selected, targetId, action);
  if (check.error) {
    toast(check.error);
    return;
  }
  snapshot();
  const result = resolveAttack(game, selected, targetId, action, d6);
  for (const strike of result.strikes) {
    const attacker = game.units.find((v) => v.id === strike.attacker),
      target = game.units.find((v) => v.id === strike.target);
    log(
      `${SHORT[attacker.team]} ${attacker.name} → ${SHORT[target.team]} ${target.name}: hits [${strike.attacks.join(",")}], saves [${strike.saves.join(",") || "none"}], ${strike.wounds} wound(s)${strike.removed ? "; removed" : ""}.`,
    );
  }
  spent = 0;
  difficultUsed = false;
  aiming = false;
  render();
  toast(
    "Combat resolved. Activation ended; Undo restores the entire exchange.",
  );
};
function moveTo(target) {
  const u = unit();
  if (!u) {
    toast("Select a miniature first.");
    return;
  }
  const result = moveResult(
    game,
    selected,
    target,
    action,
    spent,
    difficultUsed,
  );
  if (result.error) {
    toast(result.error);
    return;
  }
  if (result.length < 0.01) return;
  snapshot();
  u.x = target.x;
  u.y = target.y;
  spent += result.length;
  difficultUsed ||= result.difficult;
  log(
    `${SHORT[u.team]} ${u.name} moved ${result.length.toFixed(1)}″${result.difficult ? " through difficult terrain" : ""}.`,
  );
  render();
}
function updateCamera() {
  $("camera")?.setAttribute("transform", cameraTransform(camera));
  $("view-status").textContent =
    `${Math.round(camera.zoom * 100)}% · ${camera.angle}°`;
  $("zoom-in").disabled = camera.zoom >= 4;
  $("zoom-out").disabled = camera.zoom <= 0.5;
  // Fixed frame axes are misleading after moving the camera.
  $("board")
    .closest(".board-frame")
    .classList.toggle(
      "camera-moved",
      camera.zoom !== 1 ||
        camera.angle !== 0 ||
        camera.x !== 0 ||
        camera.y !== 0,
    );
}
function boardPoint(event) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(
    $("board").getScreenCTM().inverse(),
  );
}
$("zoom-in").onclick = () => {
  camera = zoomCamera(camera, 1.25);
  updateCamera();
};
$("zoom-out").onclick = () => {
  camera = zoomCamera(camera, 0.8);
  updateCamera();
};
for (const [id, angle] of [
  ["rotate-left", -45],
  ["rotate-right", 45],
])
  $(id).onclick = () => {
    camera.angle = (camera.angle + angle + 360) % 360;
    updateCamera();
  };
$("reset-view").onclick = () => {
  camera = defaultCamera();
  updateCamera();
};
$("pan-button").onclick = () => {
  panning = !panning;
  $("pan-button").setAttribute("aria-pressed", panning);
  $("pan-button").classList.toggle("active", panning);
  $("board").classList.toggle("pan-mode", panning);
};
$("board").addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    camera = zoomCamera(
      camera,
      Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.003),
      boardPoint(event),
    );
    updateCamera();
  },
  { passive: false },
);
$("board").addEventListener("pointerdown", (event) => {
  if (!panning || event.button !== 0 || drag) return;
  suppressClick = false;
  drag = {
    pointer: event.pointerId,
    start: boardPoint(event),
    x: camera.x,
    y: camera.y,
  };
  $("board").setPointerCapture(event.pointerId);
});
$("board").addEventListener("pointermove", (event) => {
  if (!drag || drag.pointer !== event.pointerId) return;
  const point = boardPoint(event);
  camera.x = drag.x + point.x - drag.start.x;
  camera.y = drag.y + point.y - drag.start.y;
  suppressClick = true;
  updateCamera();
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  $("board").addEventListener(name, (event) => {
    if (drag?.pointer !== event.pointerId) return;
    drag = null;
    if ($("board").hasPointerCapture(event.pointerId))
      $("board").releasePointerCapture(event.pointerId);
  });
$("weapon-range-input").onchange = () => {
  const u = unit(),
    value = Number($("weapon-range-input").value);
  if (!u || u.kind !== "bow" || u.removed || game.ended) return;
  if (!Number.isFinite(value) || value < 1 || value > 48) {
    toast("Set a demo weapon range between 1″ and 48″.");
    $("weapon-range-input").value = weaponProfile(u).range;
    return;
  }
  snapshot();
  u.weaponRange = value;
  log(`${SHORT[u.team]} ${u.name} weapon range set to ${value}″.`);
  render();
};
$("rosters").addEventListener("click", (event) => {
  const b = event.target.closest("[data-unit]");
  if (b) pickMiniature(b.dataset.unit);
});
$("board").addEventListener("click", (event) => {
  if (panning || suppressClick) {
    suppressClick = false;
    return;
  }
  if (!measuring) {
    const m = event.target.closest("[data-unit]");
    if (m) {
      pickMiniature(m.dataset.unit);
      return;
    }
  }
  const svg = $("board"),
    pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
  const world = viewToWorld(pt, camera);
  if (world.x < 0 || world.x > 960 || world.y < 0 || world.y > 960) return;
  const p = { x: world.x / 20, y: world.y / 20 };
  if (measuring) {
    if (measurePoints.length === 2) measurePoints = [];
    measurePoints.push(p);
    drawBoard();
    if (measurePoints.length === 2)
      toast(
        `Measured ${distance(...measurePoints).toFixed(1)}″ center to center.`,
      );
    return;
  }
  if (!aiming) moveTo(p);
});
$("board").addEventListener("keydown", (event) => {
  const target = event.target.closest("[data-unit]");
  if ((event.key === "Enter" || event.key === " ") && target) {
    event.preventDefault();
    pickMiniature(target.dataset.unit);
    document.querySelector(`#board [data-unit="${selected}"]`)?.focus();
    return;
  }
  const delta = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  }[event.key];
  if (delta && unit() && !aiming) {
    event.preventDefault();
    const u = unit();
    const origin = viewToWorld({ x: 480, y: 480 }, camera);
    const step = viewToWorld(
      { x: 480 + delta[0] * camera.zoom, y: 480 + delta[1] * camera.zoom },
      camera,
    );
    moveTo({ x: u.x + step.x - origin.x, y: u.y + step.y - origin.y });
    document.querySelector(`#board [data-unit="${selected}"]`)?.focus();
  }
});
$("actions").addEventListener("click", (event) => {
  const b = event.target.closest("[data-action]");
  if (!b || b.disabled) return;
  action = b.dataset.action;
  render();
});
$("finish-button").onclick = () => {
  if (!canActivate(unit())) return;
  snapshot();
  const u = unit();
  const text = u.shaken ? "recovered" : `completed ${action}`;
  finishActivation(game, selected);
  log(`${SHORT[u.team]} ${u.name} ${text}.`);
  selected = null;
  spent = 0;
  difficultUsed = false;
  render();
};
$("next-round").onclick = () => {
  if (!roundComplete(game) || game.ended) return;
  snapshot();
  nextRound(game);
  selected = null;
  spent = 0;
  difficultUsed = false;
  log(
    game.ended
      ? `Battle complete: Azure ${score(game, 0)} · Ember ${score(game, 1)} objectives.`
      : `Round ${game.round}. ${SHORT[game.player]} activates first. Objectives: ${score(game, 0)}–${score(game, 1)}.`,
  );
  render();
};
$("undo-button").onclick = () => {
  if (!history.length) return;
  const previous = history.pop();
  ({ game, selected, action, spent, difficultUsed } = previous);
  render();
  toast("Last change undone.");
};
$("shaken-button").onclick = () => {
  const u = unit();
  if (!u || u.removed || game.ended || spent > 0) return;
  snapshot();
  u.shaken = !u.shaken;
  log(`${SHORT[u.team]} ${u.name}: ${u.shaken ? "Shaken" : "Shaken cleared"}.`);
  render();
};
$("remove-button").onclick = () => {
  const u = unit();
  if (!u || u.removed || game.ended) return;
  snapshot();
  u.removed = true;
  log(`${SHORT[u.team]} ${u.name} removed from play.`);
  if (
    !game.units.some(
      (v) => v.team === game.player && !v.removed && !v.activated,
    )
  ) {
    if (game.firstFinished === null) game.firstFinished = game.player;
    if (
      game.units.some(
        (v) => v.team !== game.player && !v.removed && !v.activated,
      )
    )
      game.player = 1 - game.player;
  }
  selected = null;
  spent = 0;
  difficultUsed = false;
  render();
  toast("Miniature removed. Undo is available.");
};
for (const [id, key] of [
  ["grid-button", "grid"],
  ["deploy-button", "zones"],
  ["measure-button", "measure"],
])
  $(id).onclick = () => {
    if (key === "grid") grid = !grid;
    if (key === "zones") zones = !zones;
    if (key === "measure") {
      measuring = !measuring;
      measurePoints = [];
    }
    const on = key === "grid" ? grid : key === "zones" ? zones : measuring;
    $(id).classList.toggle("active", on);
    $(id).setAttribute("aria-pressed", on);
    render();
  };
function d6() {
  const values = new Uint32Array(1);
  let n;
  do {
    crypto.getRandomValues(values);
    n = values[0];
  } while (n >= 4294967292);
  return (n % 6) + 1;
}
$("roll-button").onclick = () => {
  const rolls = Array.from({ length: Number($("dice-count").value) }, d6);
  $("dice-results").innerHTML = rolls
    .map((r) => `<span class="die" aria-label="${r}">${r}</span>`)
    .join("");
  log(`Rolled ${rolls.length}D6: ${rolls.join(", ")}.`);
  $("battle-log").innerHTML = game.log
    .slice(0, 8)
    .map((s) => `<li>${esc(s)}</li>`)
    .join("");
  save();
};
function openGuide(content) {
  $("guide-content").innerHTML = content;
  $("guide").showModal();
}
$("close-guide").onclick = () => $("guide").close();
$("guide").addEventListener("click", (e) => {
  if (e.target === $("guide")) {
    const r = $("guide").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("guide").close();
  }
});
$("help-button").onclick = () =>
  openGuide(
    `<h2>Your table, ready to play.</h2><ol><li>Azure starts. Select one of its miniatures in the roster or on the board.</li><li>Choose Hold, Advance, Rush or Charge, then click a destination. You may make several shorter moves within the action’s total range. On keyboard, focus a board miniature, press Enter to select, then use arrow keys for 1″ steps.</li><li>Select an enemy in the combat panel or enable Pick target on map. Inspect sight/range, then resolve the attack; dice, saves, wounds and removal are automatic and the activation ends. Special rules remain manual. Mark Shaken or remove casualties with the activation panel.</li><li>End activation, then pass the device to the other player. When all miniatures have activated, advance the round.</li><li>After four rounds, the side controlling the most objectives wins.</li></ol><p>Grid squares are 6″. Use Zones to view the 12″ deployment areas, or Measure to check center-to-center distances. Undo reverses board changes; New battle clears the board. Progress saves in this browser only—there is no online multiplayer.</p><h3>Camera and ranges</h3><p>Use +/− or the mouse wheel to zoom, rotate in 45° steps, and enable Pan to drag the view with mouse or touch. Reset view fits the whole board. Arrow keys move in the screen direction after rotation. Green is remaining movement (an upper bound, not a legal-path guarantee); amber is weapon distance to target centers, including both 32 mm bases. Amber target rings check range, line of sight and action eligibility. Bows default to a demo 24″ range editable in the activation panel; melee requires base contact. Rush/Charge disable shooting; Shaken and unavailable units cannot attack. Use the combat panel to resolve attacks with demo profiles.</p><h3>Prototype boundaries</h3><p>Each demo miniature is treated as its own unit. These are illustrative rosters, not official or points-balanced army lists. Deployment is pre-set. Demo combat uses Q3+/3 HP captains, D3+ guardians, and Q4+/D4+/1 HP other models. Captains roll 3 melee dice, blades/guardians 2, rangers 1 melee or bow die. Sight is a 2D center ray: rock/ruin rectangles and intervening bases block; woods/brush overlapping the target base give +1 shooting Defense. Woods do not block sight. Charge uses the melee weapon, including rangers; Move to contact checks a straight legal path. A surviving unshaken defender retaliates; repeated melee hits only on 6 until next round. Units in contact cannot move or shoot. Damage removes at 0 HP rather than using official injury rolls. Morale, routs, disengagement, spells, special rules and multi-model units remain manual. Ruins and rocks are treated as impassable sight blockers; woodland and brush count as cover and difficult terrain. This is a tabletop companion, not a complete rules engine.</p>`,
  );
$("rules-button").onclick = () =>
  openGuide(
    `<h2>A skirmish in four rounds.</h2><p>Quick reference based on the supplied <strong>Age of Fantasy: Skirmish Core Rules v3.6.0</strong>. Refer to your PDF for complete rules.</p><h3>Prepare the battlefield</h3><p>A 48″ square with 20+ terrain pieces. Deploy within 12″ of opposite edges. Use equal-point armies; this table starts with demo rosters and three pre-placed objectives, 12″ apart and outside deployment zones.</p><h3>Activate, then alternate</h3><p>Hold: stay and shoot. Advance: move 6″ and shoot. Rush: move 12″ without shooting. Charge: move up to 12″ into melee. Difficult terrain caps total movement at 6″. The first side to finish activating starts the next round.</p><h3>Demo combat and official rules</h3><p>Quality tests succeed at the model’s Quality or higher. Defense blocks successful hits; failed blocks cause wounds. Natural 6 always succeeds; natural 1 always fails. Cover gives +1 Defense against shooting. The combat panel automates a simplified demo exchange, including retaliation and fatigue, not the complete official rules. Demo HP replaces official injury rolls. See How to play for exact prototype behavior and use the PDF for injury, morale and special rules.</p><h3>Hold the crossing</h3><p>At round end, an unshaken unit within 3″ of a marker seizes it if no enemy is in range. Contested markers become neutral; otherwise control persists. Most markers after round four wins. The table measures objective range from the base edge.</p><p>Unofficial fan-made companion. Original rules © OPR Games, created by Gaetano Ferrara. No affiliation or endorsement.</p>`,
  );
$("reset-button").onclick = () => {
  openGuide(
    '<h2>A fresh battlefield?</h2><p>This resets both warbands, objectives, rounds and the battle log. The new battle gets a fresh arrangement of 20 terrain pieces. You can undo the reset during this session.</p><div class="dialog-actions"><button id="cancel-reset" class="secondary">Keep playing</button><button id="confirm-reset" class="primary">Start new battle →</button></div>',
  );
  $("cancel-reset").onclick = () => $("guide").close();
  $("confirm-reset").onclick = () => {
    snapshot();
    game = createGame(game.seed + 1);
    selected = null;
    spent = 0;
    action = "advance";
    difficultUsed = false;
    measurePoints = [];
    $("dice-results").innerHTML =
      '<span class="die placeholder">·</span><span class="die placeholder">·</span><span class="die placeholder">·</span>';
    $("guide").close();
    render();
    toast("A fresh battlefield awaits.");
  };
};
render();
