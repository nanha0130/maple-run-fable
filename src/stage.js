// Scene, lights, post, and the chunk ring that scrolls past the runner.
import * as pc from 'playcanvas';
import { Scene, SunLight, SkyLight } from '@viggle/splat-engine';
import { createMaterials, createBackdrop, buildChunk, CHUNK, SUN, FOG } from './world.js';
import { destroyEntityMeshes } from './gfx.js';

export async function createStage(canvas, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, opts.dpr || 1.5);
  const scene = await Scene.create(canvas, {
    fov: 62, far: 1400, depth: true, maxPixelRatio: dpr,
    backend: opts.backend,
    bgColor: { r: FOG[0], g: FOG[1], b: FOG[2], a: 1 },
    cameraPosition: { x: 0, y: 3, z: 7 }, cameraTarget: { x: 0, y: 1.4, z: -6 },
  });
  scene.start();
  const app = scene.app;
  const device = scene.graphicsDevice;
  const cam = scene.cameraEntity;
  cam.camera.nearClip = 0.2;

  // --- light for meshes
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional', color: new pc.Color(1, 0.8, 0.56), intensity: 3.3,
    castShadows: true, shadowDistance: opts.lowfx ? 60 : 95, shadowResolution: opts.lowfx ? 1024 : 2048,
    numCascades: opts.lowfx ? 1 : 2, cascadeDistribution: 0.42,
    shadowBias: 0.25, normalOffsetBias: 0.08, shadowType: pc.SHADOW_PCF3_32F,
  });
  sun.setRotation(new pc.Quat().setFromDirections(new pc.Vec3(0, 1, 0), new pc.Vec3(SUN[0], SUN[1], SUN[2])));
  app.root.addChild(sun);
  app.scene.ambientLight = new pc.Color(0.72, 0.68, 0.86);
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.color = new pc.Color(FOG[0], FOG[1], FOG[2]);
  app.scene.fog.start = 38;
  app.scene.fog.end = 270;

  // --- light for the splat characters
  const sunAzDeg = (Math.atan2(SUN[0], -SUN[2]) * 180) / Math.PI;
  const splatSun = SunLight.create(scene, { azimuth: sunAzDeg, elevation: 30, color: '#ffd9a8', intensity: 0.9 });
  const splatSky = SkyLight.create(scene, { color: '#e2d3d2', intensity: 0.42 }); // kept low: splats are unshadowed, a bright fill makes them glow against the scene

  // --- post
  let frame = null;
  if (!opts.nopost) {
    try {
      frame = scene.getOrCreateCameraFrame();
      frame.rendering.toneMapping = pc.TONEMAP_ACES;
      frame.rendering.samples = opts.lowfx ? 1 : 4;
      frame.bloom.intensity = 0.028;
      frame.bloom.blurLevel = 7;
      frame.vignette.intensity = 0.42; frame.vignette.inner = 0.42; frame.vignette.outer = 1.15; frame.vignette.curvature = 0.6;
      frame.grading.enabled = true; frame.grading.saturation = 1.12; frame.grading.contrast = 1.06; frame.grading.brightness = 1.0;
      frame.update();
    } catch (e) { console.warn('post unavailable', e); frame = null; }
  }

  const { m: mats, tx } = createMaterials(device);
  // reflections: an environment atlas baked once from the painted sky + forest horizon
  try {
    tx.env.projection = pc.TEXTUREPROJECTION_EQUIRECT;
    const lighting = pc.EnvLighting.generateLightingSource(tx.env);
    app.scene.envAtlas = pc.EnvLighting.generateAtlas(lighting);
    lighting.destroy();
    // the atlas is for reflections only: the painted dome stays the visible sky
    cam.camera.layers = cam.camera.layers.filter((id) => id !== pc.LAYERID_SKYBOX);
  } catch (e) { console.warn('no environment reflections', e); }
  const worldRoot = new pc.Entity('world');
  scene.contentRoot.addChild(worldRoot);
  const backdrop = createBackdrop(device, mats);
  scene.contentRoot.addChild(backdrop);

  const chunks = new Map();
  const BEHIND = opts.behind ?? 70, AHEAD = opts.lowfx ? 230 : 300;
  let origin = 0;

  const stage = {
    scene, app, device, cam, mats, tx, worldRoot, backdrop, frame, sun, splatSun, splatSky, chunks,
    /** Keep the chunk ring around track distance s. `budget` = chunks built this call. */
    update(s, budget = 1, behind = BEHIND) {
      origin = s;
      worldRoot.setLocalPosition(0, 0, s);
      const k0 = Math.floor((s - behind) / CHUNK), k1 = Math.floor((s + AHEAD) / CHUNK);
      for (const [k, e] of chunks) if (k < k0 - 1 || k > k1 + 1) { destroyEntityMeshes(e); chunks.delete(k); }
      for (let k = k0; k <= k1 && budget > 0; k++) {
        if (chunks.has(k)) continue;
        const e = buildChunk(device, mats, k);
        worldRoot.addChild(e);
        chunks.set(k, e);
        budget--;
      }
      const cp = cam.getPosition();
      backdrop.setLocalPosition(cp.x, 0, cp.z);
      // keep the river pinned to the world while the world scrolls
      const off = ((s / 14) % 1 + 1) % 1;
      mats.water.diffuseMapOffset.set(0, off);
      mats.water.normalMapOffset.set((stage.time * 0.035) % 1, ((off * 5 + stage.time * 0.06) % 1 + 1) % 1);
      mats.water.update();
    },
    time: 0,
    /** world-space z for a track distance */
    z: (s) => origin - s,
    get origin() { return origin; },
  };
  return stage;
}
