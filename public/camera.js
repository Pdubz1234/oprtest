// Camera coordinates use SVG units (20 units per battlefield inch).
export const defaultCamera = () => ({ zoom: 1, angle: 0, x: 0, y: 0 });
export function viewToWorld(point, camera) {
  const a = (-camera.angle * Math.PI) / 180;
  const x = (point.x - 480 - camera.x) / camera.zoom;
  const y = (point.y - 480 - camera.y) / camera.zoom;
  return {
    x: 480 + x * Math.cos(a) - y * Math.sin(a),
    y: 480 + x * Math.sin(a) + y * Math.cos(a),
  };
}
export function worldToView(point, camera) {
  const a = (camera.angle * Math.PI) / 180;
  const x = point.x - 480,
    y = point.y - 480;
  return {
    x: 480 + camera.x + camera.zoom * (x * Math.cos(a) - y * Math.sin(a)),
    y: 480 + camera.y + camera.zoom * (x * Math.sin(a) + y * Math.cos(a)),
  };
}
export function zoomCamera(camera, factor, anchor = { x: 480, y: 480 }) {
  const world = viewToWorld(anchor, camera);
  const next = {
    ...camera,
    zoom: Math.max(0.5, Math.min(4, camera.zoom * factor)),
  };
  const shifted = worldToView(world, next);
  next.x += anchor.x - shifted.x;
  next.y += anchor.y - shifted.y;
  return next;
}
export const cameraTransform = (c) =>
  `translate(${480 + c.x} ${480 + c.y}) rotate(${c.angle}) scale(${c.zoom}) translate(-480 -480)`;
