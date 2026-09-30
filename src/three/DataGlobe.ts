import * as THREE from 'three';

const VERT = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uPixelRatio;
uniform float uSize;
attribute float aLat;
attribute vec3 aSeed;
varying float vLat;
varying float vAlpha;

// cheap pseudo-noise from position
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

void main() {
  vLat = aLat;
  vec3 base = position;
  // scattered start state -> assembled sphere
  vec3 scattered = base + aSeed * (1.0 - uProgress) * 1.8;
  // noise displacement in shader (grows as globe assembles)
  float n = sin(base.x * 6.0 + uTime * 0.18)
          * sin(base.y * 6.0 - uTime * 0.14)
          * sin(base.z * 6.0 + uTime * 0.15);
  float n2 = hash(floor(base * 14.0)) - 0.5;
  vec3 dir = normalize(base);
  vec3 displaced = scattered + dir * (n * 0.07 + n2 * 0.05) * uProgress;
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  // fade scattered points slightly
  vAlpha = smoothstep(0.0, 0.25, uProgress) * 0.9 + 0.1 * uProgress;
  gl_PointSize = uSize * uPixelRatio * (1.6 / max(dist, 0.001)) * (0.6 + 0.4 * uProgress);
}
`;

const FRAG = /* glsl */ `
uniform float uProgress;
uniform float uPulse;
varying float vLat;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.08, d);
  vec3 cyan = vec3(0.133, 0.827, 0.933); // #22d3ee
  vec3 blue = vec3(0.231, 0.510, 0.965); // #3b82f6
  float t = clamp(vLat * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(cyan, blue, t);
  // gentle bloom-like pulse, shader only
  col *= (1.0 + uPulse * 1.6);
  float a = soft * vAlpha * uProgress * 0.62;
  gl_FragColor = vec4(col, a);
}
`;

function fibonacciSphere(count: number, radius: number): { positions: Float32Array; lats: Float32Array; seeds: Float32Array } {
  const positions = new Float32Array(count * 3);
  const lats = new Float32Array(count);
  const seeds = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // 1..-1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    positions[i * 3] = x * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z * radius;
    lats[i] = y;
    // random scatter direction (unit-ish)
    const sx = Math.random() * 2 - 1;
    const sy = Math.random() * 2 - 1;
    const sz = Math.random() * 2 - 1;
    seeds[i * 3] = sx;
    seeds[i * 3 + 1] = sy;
    seeds[i * 3 + 2] = sz;
  }
  return { positions, lats, seeds };
}

export class DataGlobe {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private group = new THREE.Group();
  private globeMat: THREE.ShaderMaterial;
  private globeGeo: THREE.BufferGeometry;
  private globe: THREE.Points;
  private dustGeo: THREE.BufferGeometry;
  private dustMat: THREE.PointsMaterial;
  private dust: THREE.Points;
  private ringGeos: THREE.TorusGeometry[] = [];
  private ringMats: THREE.MeshBasicMaterial[] = [];
  private rings: THREE.Mesh[] = [];
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private disposed = false;
  private reducedMotion: boolean;
  private progress = 0;
  private revealed = false;
  private pulse = 0;
  private pulseActive = false;
  private pulseStart = 0;
  private last = 0;
  private elapsed = 0;
  private targetRX = 0;
  private targetRY = 0;
  private curRX = 0;
  private curRY = 0;
  private onPointerMove: (e: PointerEvent) => void;
  private onResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Fail fast when WebGL is unavailable so UI can render a fallback.
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
    renderer.setClearColor(0x000000, 0); // transparent — CSS #050810 behind
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const parent = canvas.parentElement ?? canvas;
    const w = parent.clientWidth || canvas.clientWidth || window.innerWidth;
    const h = parent.clientHeight || canvas.clientHeight || window.innerHeight || 600;
    renderer.setSize(w, h, false);

    this.camera = new THREE.PerspectiveCamera(42, w / Math.max(h, 1), 0.1, 100);
    this.fitDistance(w, h);

    const isMobile = Math.min(window.innerWidth, w) < 640;
    const count = isMobile ? 4500 : 10000;
    const { positions, lats, seeds } = fibonacciSphere(count, 1.6);

    this.globeGeo = new THREE.BufferGeometry();
    this.globeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.globeGeo.setAttribute('aLat', new THREE.BufferAttribute(lats, 1));
    this.globeGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

    this.globeMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uPulse: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSize: { value: isMobile ? 26 : 30 },
      },
    });
    this.globe = new THREE.Points(this.globeGeo, this.globeMat);

    // 2 thin torus rings, tilted
    const ringDefs = [
      { r: 2.15, tube: 0.006, color: 0x22d3ee, opacity: 0.4, x: Math.PI / 2.35, y: 0.35 },
      { r: 2.45, tube: 0.005, color: 0x3b82f6, opacity: 0.28, x: Math.PI / 1.85, y: -0.5 },
    ];
    for (const d of ringDefs) {
      const g = new THREE.TorusGeometry(d.r, d.tube, 8, 180);
      const m = new THREE.MeshBasicMaterial({
        color: d.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.set(d.x, d.y, 0);
      this.ringGeos.push(g);
      this.ringMats.push(m);
      this.rings.push(mesh);
      this.group.add(mesh);
    }

    this.group.add(this.globe);

    // ~700-star dust background
    const dustCount = 700;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      // random shell radius 4..9
      const rad = 4 + Math.random() * 5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      dustPos[i * 3] = rad * Math.sin(ph) * Math.cos(th);
      dustPos[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th);
      dustPos[i * 3 + 2] = rad * Math.cos(ph);
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0x9fd8ff,
      size: 0.05,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(this.dustGeo, this.dustMat);
    this.scene.add(this.dust);

    this.scene.add(this.group);
    this.applyProgress(0);

    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      this.targetRY = nx * 0.35;
      this.targetRX = ny * 0.25;
    };
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);

    const observed = canvas.parentElement;
    if (observed && typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(observed);
    }

    if (this.reducedMotion) {
      this.renderFrame(0, 0);
      return;
    }
    this.last = performance.now();
    const loop = (t: number) => {
      if (this.disposed) return;
      const dt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      this.elapsed += dt;
      this.renderFrame(dt, this.elapsed);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setProgress(p: number): void {
    const v = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
    this.progress = v;
    this.applyProgress(v);
    if (this.reducedMotion && !this.disposed) this.renderFrame(0, this.elapsed);
  }

  setRevealed(v: boolean): void {
    this.revealed = v;
    if (v && !this.disposed) {
      // trigger gentle bloom-like pulse (shader uniform, no postprocessing)
      this.pulseActive = true;
      this.pulseStart = this.elapsed;
      if (this.reducedMotion) {
        this.pulse = 0.55;
        (this.globeMat.uniforms.uPulse as { value: number }).value = this.pulse;
        this.renderFrame(0, this.elapsed);
        this.pulseActive = false;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
    this.ro = null;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Points || o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.globeGeo.dispose();
    this.globeMat.dispose();
    this.dustGeo.dispose();
    this.dustMat.dispose();
    this.ringGeos.forEach((g) => g.dispose());
    this.ringMats.forEach((m) => m.dispose());
    this.renderer.dispose();
  }

  private applyProgress(v: number): void {
    const s = 0.8 + 0.2 * v;
    this.group.scale.setScalar(s);
    (this.globeMat.uniforms.uProgress as { value: number }).value = v;
    this.globeMat.transparent = true;
    this.ringMats.forEach((m, i) => {
      m.opacity = (i === 0 ? 0.4 : 0.28) * v;
    });
    this.dustMat.opacity = 0.3 + 0.5 * v;
  }

  private fitDistance(w: number, h: number): void {
    // Fit the globe within the viewport on any aspect: derive the distance
    // from the real horizontal FOV so narrow phones pull back far enough.
    // (A fixed linear offset under-fit phones — the globe bled off-screen.)
    const aspect = w / Math.max(h, 1);
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    if (!(hHalf > 0)) return;
    const zForWidth = 1.85 / Math.tan(hHalf);
    const zForHeight = 1.8 / Math.tan(vHalf);
    const z = Math.max(4.6, zForWidth, zForHeight);
    if (Number.isFinite(z)) this.camera.position.z = z;
  }

  private resize(): void {
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
    (this.globeMat.uniforms.uPixelRatio as { value: number }).value = pr;
    if (this.reducedMotion) this.renderFrame(0, this.elapsed);
  }

  private renderFrame(dt: number, t: number): void {
    (this.globeMat.uniforms.uTime as { value: number }).value = t;

    // pulse envelope: rise ~0.25s, decay ~1.2s
    if (this.pulseActive) {
      const e = t - this.pulseStart;
      if (e < 0.25) this.pulse = e / 0.25;
      else this.pulse = Math.max(0, 1 - (e - 0.25) / 1.2);
      if (e > 1.45) {
        this.pulse = 0;
        this.pulseActive = false;
      }
      (this.globeMat.uniforms.uPulse as { value: number }).value = this.pulse;
    }

    if (!this.reducedMotion) {
      // slow auto-rotate
      this.group.rotation.y += dt * 0.05;
      if (this.rings[0]) this.rings[0].rotation.z += dt * 0.02;
      if (this.rings[1]) this.rings[1].rotation.z -= dt * 0.015;
      this.dust.rotation.y -= dt * 0.004;
      // mouse parallax (lerp)
      const k = 1 - Math.pow(0.001, dt); // frame-rate independent smoothing
      this.curRX += (this.targetRX - this.curRX) * k;
      this.curRY += (this.targetRY - this.curRY) * k;
      this.camera.position.x = this.curRY * 1.0;
      this.camera.position.y = -this.curRX * 0.7;
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera.position.x = 0;
      this.camera.position.y = 0;
      this.camera.lookAt(0, 0, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
