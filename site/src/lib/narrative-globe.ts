import * as THREE from 'three';

/**
 * NarrativeGlobe — scroll-driven companion to the teaser globe.
 *
 * Owns its render loop and lerps an internal progress value toward the
 * target set via `setProgress`, so scroll-driven updates never jitter.
 * Scroll position (not wall-clock time) drives the timeline; `uTime` only
 * feeds a subtle per-point shimmer.
 *
 * Stages by progress:
 *  0–0.25    scattered cloud assembles into a sphere
 *  0.25–0.5  accent marker ring lands on Bengaluru
 *  0.5–0.75  sphere unfurls into a node network (accent hairlines)
 *  0.75–1    dissolves / fades as the section exits
 *
 * Draw calls: 1 Points (globe) + 1 LineSegments (network) + 3 tiny
 * marker meshes. No postprocessing.
 */

const VERT = /* glsl */ `
uniform float uAssemble;
uniform float uNetwork;
uniform float uDissolve;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
attribute vec3 aSeed;
attribute vec3 aNet;
attribute float aRand;
varying float vAlpha;
varying float vWarm;

void main() {
  float a = uAssemble * uAssemble * (3.0 - 2.0 * uAssemble);
  float n = uNetwork * uNetwork * (3.0 - 2.0 * uNetwork);
  vec3 scattered = position + aSeed * 2.2;
  vec3 pos = mix(scattered, position, a);
  pos = mix(pos, aNet, n);
  float wob = sin(position.x * 5.0 + uTime * 0.25)
            * sin(position.y * 5.0 - uTime * 0.20)
            * sin(position.z * 5.0 + uTime * 0.22);
  vec3 dir = normalize(position);
  pos += dir * wob * 0.05 * a * (1.0 - n) * (1.0 - uDissolve);
  pos += dir * uDissolve * 1.8;
  pos += aSeed * uDissolve * 0.8;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.001);
  float tw = 0.75 + 0.25 * sin(uTime * 0.8 + aRand * 6.2831);
  vAlpha = tw * (0.15 + 0.85 * a) * (1.0 - uDissolve);
  // Only a minority of points warm toward the accent as the network forms.
  vWarm = n * step(0.86, aRand);
  gl_PointSize = uSize * uPixelRatio * (1.5 / dist);
}
`;

const FRAG = /* glsl */ `
uniform float uGlobalAlpha;
varying float vAlpha;
varying float vWarm;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.1, d);
  vec3 paper = vec3(0.961, 0.961, 0.949);   // #F5F5F2
  vec3 signal = vec3(1.0, 0.353, 0.212);    // #FF5A36
  vec3 col = mix(paper, signal, vWarm * 0.85);
  float a = soft * vAlpha * uGlobalAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
}
`;

const RADIUS = 1.6;
const NODE_COUNT = 24;
const ACCENT = 0xff5a36;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** 0→1 eased across [edge0, edge1] of progress p. */
function stage(p: number, edge0: number, edge1: number): number {
  const t = clamp01((p - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

export class NarrativeGlobe {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private geo: THREE.BufferGeometry;
  private points: THREE.Points;
  private lineGeo: THREE.BufferGeometry;
  private lineMat: THREE.LineBasicMaterial;
  private lines: THREE.LineSegments;
  private marker = new THREE.Group();
  private markerMats: THREE.MeshBasicMaterial[] = [];
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private visible = true;
  private disposed = false;
  private reducedMotion: boolean;
  private target = 0;
  private current = 0;
  private elapsed = 0;
  private last = 0;
  private onResize: () => void;
  private onVisibility: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Fail fast when WebGL is unavailable so the UI can render a fallback.
    const gl =
      canvas.getContext('webgl2') ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) throw new Error('webgl-unavailable');

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      throw new Error('webgl-unavailable');
    }
    this.renderer = renderer;
    renderer.setClearColor(0x080808, 1); // --bg
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const parent = canvas.parentElement ?? canvas;
    const w = parent.clientWidth || canvas.clientWidth || window.innerWidth;
    const h = parent.clientHeight || canvas.clientHeight || window.innerHeight || 600;
    renderer.setSize(w, h, false);

    this.camera = new THREE.PerspectiveCamera(42, w / Math.max(h, 1), 0.1, 100);
    this.fitDistance(w, h);

    const isMobile = Math.min(window.innerWidth, w) < 640;
    const count = isMobile ? 2500 : 6000;

    // Sphere slots (fibonacci) + scatter seeds + network targets.
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const nets = new Float32Array(count * 3);
    const rands = new Float32Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));

    // Network cluster centres on a slightly wider shell so unfurling expands.
    const nodes: THREE.Vector3[] = [];
    for (let k = 0; k < NODE_COUNT; k++) {
      const y = 1 - (k / (NODE_COUNT - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * k;
      nodes.push(
        new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(RADIUS * 1.55),
      );
    }

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const px = Math.cos(theta) * r * RADIUS;
      const py = y * RADIUS;
      const pz = Math.sin(theta) * r * RADIUS;
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;

      const sx = Math.random() * 2 - 1;
      const sy = Math.random() * 2 - 1;
      const sz = Math.random() * 2 - 1;
      seeds[i * 3] = sx;
      seeds[i * 3 + 1] = sy;
      seeds[i * 3 + 2] = sz;

      const node = nodes[(i * 7) % NODE_COUNT];
      const j = 0.28;
      nets[i * 3] = node.x + (Math.random() * 2 - 1) * j;
      nets[i * 3 + 1] = node.y + (Math.random() * 2 - 1) * j;
      nets[i * 3 + 2] = node.z + (Math.random() * 2 - 1) * j;

      rands[i] = Math.random();
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.geo.setAttribute('aNet', new THREE.BufferAttribute(nets, 3));
    this.geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uAssemble: { value: 0 },
        uNetwork: { value: 0 },
        uDissolve: { value: 0 },
        uTime: { value: 0 },
        uGlobalAlpha: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSize: { value: isMobile ? 22 : 26 },
      },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.group.add(this.points);

    // Network hairlines: each node joined to its two nearest neighbours.
    const pairs: number[] = [];
    for (let a = 0; a < NODE_COUNT; a++) {
      const dists = nodes
        .map((n, b) => ({ b, d: a === b ? Infinity : nodes[a].distanceToSquared(n) }))
        .sort((m, n) => m.d - n.d);
      for (let k = 0; k < 2; k++) {
        const nb = nodes[dists[k].b];
        pairs.push(nodes[a].x, nodes[a].y, nodes[a].z, nb.x, nb.y, nb.z);
      }
    }
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs), 3));
    this.lineMat = new THREE.LineBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(this.lineGeo, this.lineMat);
    this.group.add(this.lines);

    // Bengaluru marker: dot + landing ring + faint outer ring.
    const home = latLonToVec3(12.9716, 77.5946, RADIUS + 0.02);
    const dir = home.clone().normalize();
    this.marker.position.copy(home);
    this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const markerDefs = [
      { geo: new THREE.CircleGeometry(0.03, 24), opacity: 1 },
      { geo: new THREE.RingGeometry(0.085, 0.1, 48), opacity: 0.9 },
      { geo: new THREE.RingGeometry(0.16, 0.168, 48), opacity: 0.35 },
    ];
    for (const d of markerDefs) {
      const m = new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(d.geo, m);
      mesh.userData.baseOpacity = d.opacity;
      this.marker.add(mesh);
      this.markerMats.push(m);
    }
    this.group.add(this.marker);

    this.group.rotation.x = 0.18;
    this.scene.add(this.group);
    this.applyState(0, 0);

    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);

    this.onVisibility = () => {
      // Re-render once when the tab becomes visible again so the frame
      // never looks stale; the loop itself keeps running but skips draws.
      if (!document.hidden && this.visible && !this.disposed && this.reducedMotion) {
        this.renderOnce();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    if (typeof IntersectionObserver !== 'undefined' && parent) {
      this.io = new IntersectionObserver(
        (entries) => {
          this.visible = entries.some((e) => e.isIntersecting);
        },
        { threshold: 0 },
      );
      this.io.observe(parent);
    }

    if (typeof ResizeObserver !== 'undefined' && parent) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(parent);
    }

    if (this.reducedMotion) {
      this.target = 0.4;
      this.current = 0.4;
      this.renderOnce();
      return;
    }

    this.last = performance.now();
    const loop = (t: number) => {
      if (this.disposed) return;
      const dt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      const k = 1 - Math.pow(0.001, dt); // frame-rate independent lerp
      const diff = this.target - this.current;
      if (Math.abs(diff) < 0.0004) {
        this.current = this.target;
      } else {
        this.current += diff * k;
      }
      if (this.visible && !document.hidden) {
        this.elapsed += dt;
        this.applyState(this.current, this.elapsed);
        this.renderer.render(this.scene, this.camera);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Scroll target 0→1. Internally lerped toward; never snaps. */
  setProgress(p: number): void {
    this.target = clamp01(p);
    if (this.reducedMotion && !this.disposed) this.renderOnce();
  }

  setReducedMotion(b: boolean): void {
    this.reducedMotion = b;
    if (this.disposed) return;
    if (b) {
      cancelAnimationFrame(this.raf);
      this.target = 0.4;
      this.current = 0.4;
      this.renderOnce();
    } else {
      this.last = performance.now();
      const loop = (t: number) => {
        if (this.disposed) return;
        const dt = Math.min((t - this.last) / 1000, 0.05);
        this.last = t;
        const k = 1 - Math.pow(0.001, dt);
        const diff = this.target - this.current;
        if (Math.abs(diff) < 0.0004) {
          this.current = this.target;
        } else {
          this.current += diff * k;
        }
        if (this.visible && !document.hidden) {
          this.elapsed += dt;
          this.applyState(this.current, this.elapsed);
          this.renderer.render(this.scene, this.camera);
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  resize(): void {
    if (this.disposed) return;
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight || 600;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.fitDistance(w, h);
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    (this.mat.uniforms.uPixelRatio as { value: number }).value = pr;
    if (this.reducedMotion) this.renderOnce();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ro?.disconnect();
    this.ro = null;
    this.io?.disconnect();
    this.io = null;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Points || o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.geo.dispose();
    this.mat.dispose();
    this.lineGeo.dispose();
    this.lineMat.dispose();
    this.marker.children.forEach((c) => {
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    });
    this.markerMats.forEach((m) => m.dispose());
    this.renderer.dispose();
  }

  private renderOnce(): void {
    this.applyState(this.current, this.elapsed);
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  private applyState(p: number, t: number): void {
    const u = this.mat.uniforms as Record<string, { value: number }>;
    const assemble = stage(p, 0, 0.25);
    const markerIn = stage(p, 0.25, 0.38);
    const network = stage(p, 0.5, 0.64);
    const dissolve = stage(p, 0.75, 0.98);
    u.uAssemble.value = assemble;
    u.uNetwork.value = network * (1 - dissolve);
    u.uDissolve.value = dissolve;
    u.uTime.value = t;
    u.uGlobalAlpha.value = 0.62 * stage(p, 0, 0.06) * (1 - dissolve * 0.97);

    // Scroll-linked rotation: the timeline is scroll, not the clock.
    this.group.rotation.y = p * 2.4;

    // Network hairlines stay faint — accent is a minority.
    this.lineMat.opacity = 0.26 * network * (1 - dissolve);

    // Marker ring lands (scale settles) then fades with the dissolve.
    const land = 1 + (1 - markerIn) * 1.4;
    this.marker.scale.setScalar(Math.max(land, 0.001));
    const markerOut = 1 - stage(p, 0.68, 0.8);
    this.marker.children.forEach((c) => {
      if (c instanceof THREE.Mesh) {
        const m = c.material as THREE.MeshBasicMaterial;
        const base = (c.userData.baseOpacity as number) ?? 0.5;
        m.opacity = base * markerIn * markerOut;
      }
    });
    this.marker.visible = markerIn * markerOut > 0.001;
  }

  private fitDistance(w: number, h: number): void {
    const aspect = w / Math.max(h, 1);
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    if (!(hHalf > 0)) return;
    const zForWidth = 1.85 / Math.tan(hHalf);
    const zForHeight = 1.8 / Math.tan(vHalf);
    const z = Math.max(4.6, zForWidth, zForHeight);
    if (Number.isFinite(z)) this.camera.position.z = z;
  }
}
