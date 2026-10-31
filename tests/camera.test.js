import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultCamera,
  viewToWorld,
  worldToView,
  zoomCamera,
} from "../public/camera.js";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("inverse camera preserves click/ruler coordinates across pan, rotation and zoom", () => {
  for (const angle of [0, 45, 90, 180, 270, 315])
    for (const zoom of [0.5, 1, 2, 4]) {
      const camera = { angle, zoom, x: 71, y: -110 };
      for (const point of [
        { x: 0, y: 0 },
        { x: 140, y: 288 },
        { x: 960, y: 960 },
      ]) {
        const restored = viewToWorld(worldToView(point, camera), camera);
        close(restored.x, point.x);
        close(restored.y, point.y);
      }
    }
});
test("zoom anchors the same world point and clamps to 50–400 percent", () => {
  const camera = { angle: 45, zoom: 1, x: 100, y: -30 };
  const anchor = { x: 192, y: 540 },
    world = viewToWorld(anchor, camera);
  const next = zoomCamera(camera, 2, anchor);
  const position = worldToView(world, next);
  close(position.x, anchor.x);
  close(position.y, anchor.y);
  assert.equal(zoomCamera(camera, 100).zoom, 4);
  assert.equal(zoomCamera(camera, 0.01).zoom, 0.5);
  assert.deepEqual(defaultCamera(), { zoom: 1, angle: 0, x: 0, y: 0 });
});
