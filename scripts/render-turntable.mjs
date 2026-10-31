/**
 * render-turntable.mjs — offline renderer for the story bearer.
 *
 * Loads scripts/assets/human_figure.glb in headless Chromium (three, WebGL),
 * renders a full 360° turntable on a transparent background, then converts each
 * frame to a screen-space halftone and writes WebP files for the landing page.
 *
 * The runtime never loads three: the page only swaps pre-rendered frames.
 *
 * Usage:
 *   node scripts/render-turntable.mjs [--frames=36] [--width=640] [--height=960]
 *     [--cell=4] [--quality=0.86] [--out=public/story/turntable]
 *     [--preview=tmp-preview.png]
 *
 * The preview flag writes frame 00 as a PNG for eyeballing before committing to
 * the whole sequence.
 */

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(process.cwd());
const DEFAULTS = {
  frames: 36,
  width: 640,
  height: 960,
  cell: 4,
  quality: 0.86,
  out: 'public/story/turntable',
  preview: '',
};

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = 'true'] = a.replace(/^--/, '').split('=');
      return [k, v];
    }),
);

const CFG = {
  frames: Number(args.frames ?? DEFAULTS.frames),
  width: Number(args.width ?? DEFAULTS.width),
  height: Number(args.height ?? DEFAULTS.height),
  cell: Number(args.cell ?? DEFAULTS.cell),
  quality: Number(args.quality ?? DEFAULTS.quality),
  out: String(args.out ?? DEFAULTS.out),
  preview: String(args.preview ?? DEFAULTS.preview),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>html,body{margin:0;background:transparent;overflow:hidden}</style>
    <script type="importmap">
      {
        "imports": {
          "three": "/node_modules/three/build/three.module.js",
          "three/addons/": "/node_modules/three/examples/jsm/"
        }
      }
    </script>
  </head>
  <body>
    <script type="module">
      import * as THREE from 'three';
      import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

      const W = ${CFG.width};
      const H = ${CFG.height};
      const INK = [17, 17, 16];
      const BAYER4 = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
      ];

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      document.body.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);

      scene.add(new THREE.AmbientLight(0xffffff, 0.05));
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(-6, 2.5, 3.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.9);
      rim.position.set(0.5, 3, -6);
      scene.add(rim);

      const gltf = await new GLTFLoader().loadAsync('/scripts/assets/human_figure.glb');
      const model = gltf.scene;

      // The exporter is Z-up; stand it on Y and centre it at the origin.
      model.rotation.x = -Math.PI / 2;
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      model.position.x -= centre.x;
      model.position.z -= centre.z;
      model.position.y -= box.min.y;

      // Render the sculpt as a lit grey and let the halftone turn light into
      // ink density. A charcoal base would come out as a solid black mass.
      model.traverse((child) => {
        if (!child.isMesh) return;
        const material = child.material;
        material.color = new THREE.Color(0x808080);
        material.roughness = 0.95;
        material.metalness = 0;
        material.side = THREE.FrontSide;
        child.castShadow = false;
        child.receiveShadow = false;
      });

      // Frame the figure with a little air above the head and below the feet.
      const height = size.y;
      const spin = new THREE.Group();
      spin.add(model);
      spin.position.y = -height / 2;
      scene.add(spin);

      const visible = height / 0.8;
      const distance = visible / (2 * Math.tan((camera.fov * Math.PI) / 360));
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      function halftone(source) {
        const flat = document.createElement('canvas');
        flat.width = W;
        flat.height = H;
        const fctx = flat.getContext('2d', { willReadFrequently: true });
        fctx.drawImage(source, 0, 0, W, H);

        const src = fctx.getImageData(0, 0, W, H).data;
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const octx = out.getContext('2d');
        const img = octx.createImageData(W, H);
        const dst = img.data;
        const cell = ${CFG.cell};
        const area = cell * cell;

        for (let cy = 0; cy < H; cy += cell) {
          for (let cx = 0; cx < W; cx += cell) {
            let sum = 0;
            for (let y = 0; y < cell; y += 1) {
              for (let x = 0; x < cell; x += 1) {
                const px = cx + x;
                const py = cy + y;
                if (px >= W || py >= H) continue;
                const i = (py * W + px) * 4;
                const alpha = src[i + 3] / 255;
                if (alpha <= 0.02) continue;
                const lum =
                  (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255;
                // Darkness -> ink coverage: shadows solid, highlights sparse.
                sum += alpha * Math.min(1, Math.max(0, (1 - lum) * 1.05));
              }
            }

            let dots = Math.round((sum / area) * area);
            if (dots <= 0) continue;
            if (dots > area) dots = area;

            for (let y = 0; y < cell; y += 1) {
              for (let x = 0; x < cell; x += 1) {
                if (BAYER4[y % 4][x % 4] >= dots) continue;
                const px = cx + x;
                const py = cy + y;
                if (px >= W || py >= H) continue;
                const o = (py * W + px) * 4;
                dst[o] = INK[0];
                dst[o + 1] = INK[1];
                dst[o + 2] = INK[2];
                dst[o + 3] = 255;
              }
            }
          }
        }

        octx.putImageData(img, 0, 0);
        return out;
      }

      window.__frame = (index) => {
        // Start a quarter-turn off the front so the first frame shows the
        // sculpt's form rather than a flat, symmetrical face-on view.
        spin.rotation.y = -Math.PI / 7 + (index / ${CFG.frames}) * Math.PI * 2;
        renderer.render(scene, camera);
        const raw = renderer.domElement.toDataURL('image/png');
        const dithered = halftone(renderer.domElement);
        return {
          webp: dithered.toDataURL('image/webp', ${CFG.quality}),
          png: dithered.toDataURL('image/png'),
          raw,
        };
      };

      window.__info = {
        height,
        width: size.x,
        depth: size.z,
        distance,
        drawCalls: renderer.info.render.calls,
      };
      window.__ready = true;
    </script>
  </body>
</html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/__turntable.html') {
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(PAGE);
    return;
  }

  const file = resolve(join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: CFG.width, height: CFG.height } });
page.on('console', (message) => {
  if (message.type() === 'error') console.error('[page]', message.text());
});

try {
  await page.goto(`http://127.0.0.1:${port}/__turntable.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120_000 });

  const info = await page.evaluate('window.__info');
  console.log('model', info);

  await mkdir(resolve(CFG.out), { recursive: true });

  let totalBytes = 0;
  for (let i = 0; i < CFG.frames; i += 1) {
    const { webp, png, raw } = await page.evaluate((index) => window.__frame(index), i);
    const data = Buffer.from(webp.split(',')[1], 'base64');
    const name = `frame-${String(i).padStart(2, '0')}.webp`;
    await writeFile(join(CFG.out, name), data);
    totalBytes += data.length;

    if (i === 0 && CFG.preview) {
      await writeFile(resolve(CFG.preview), Buffer.from(png.split(',')[1], 'base64'));
      await writeFile(resolve(CFG.preview).replace(/\.png$/, '-raw.png'), Buffer.from(raw.split(',')[1], 'base64'));
    }
    if (i === 0 || (i + 1) % 6 === 0) {
      console.log(`frame ${String(i).padStart(2, '0')} ${(data.length / 1024).toFixed(1)} kB`);
    }
  }

  console.log(
    `${CFG.frames} frames, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total -> ${CFG.out}`,
  );
} finally {
  await browser.close();
  server.close();
}
