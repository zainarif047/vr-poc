import * as THREE from 'three';

// Procedural PBR texture maps (no external image downloads → works offline, small bundle).

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, seed: number, px: number, py: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px,
    x1 = (((xi + 1) % px) + px) % px;
  const y0 = ((yi % py) + py) % py,
    y1 = (((yi + 1) % py) + py) % py;
  const a = hash(x0, y0, seed),
    b = hash(x1, y0, seed),
    c = hash(x0, y1, seed),
    d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** tileable fbm; fx/fy = base frequency along each axis (can differ for brushed streaks) */
function fbm(u: number, v: number, fx: number, fy: number, seed: number, oct = 4) {
  let amp = 0.5,
    sum = 0,
    norm = 0,
    ax = fx,
    ay = fy;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * ax, v * ay, seed + o * 17, ax, ay);
    norm += amp;
    amp *= 0.5;
    ax *= 2;
    ay *= 2;
  }
  return sum / norm;
}

type Px = (u: number, v: number, x: number, y: number) => [number, number, number];
function paint(size: number, fn: Px, srgb: boolean, repeat: [number, number] = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r));
      img.data[i + 1] = Math.max(0, Math.min(255, g));
      img.data[i + 2] = Math.max(0, Math.min(255, b));
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return finish(c, srgb, repeat);
}
function finish(c: HTMLCanvasElement, srgb: boolean, repeat: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface MapSet {
  map: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

/** Brushed metal: horizontal streaks (anisotropic look). */
export function brushedSet(base: [number, number, number], repeat: [number, number] = [2, 2]): MapSet {
  const streak = (u: number, v: number) => fbm(u, v, 2, 160, 3, 3) * 0.7 + fbm(u, v, 24, 40, 9, 2) * 0.3;
  return {
    map: paint(
      512,
      (u, v) => {
        const n = streak(u, v);
        const k = 0.78 + n * 0.4;
        return [base[0] * k, base[1] * k, base[2] * k];
      },
      true,
      repeat,
    ),
    rough: paint(
      512,
      (u, v) => {
        const n = streak(u, v);
        const g = 255 * (0.26 + n * 0.34);
        return [g, g, g];
      },
      false,
      repeat,
    ),
    bump: paint(
      512,
      (u, v) => {
        const g = 255 * streak(u, v);
        return [g, g, g];
      },
      false,
      repeat,
    ),
  };
}

/** Mill-scale / blasted steel plate. */
export function scaleSet(base: [number, number, number], repeat: [number, number] = [2, 2], freq = 5, contrast = 0.7): MapSet {
  const n = (u: number, v: number) => fbm(u, v, freq, freq, 21, 5);
  return {
    map: paint(
      512,
      (u, v) => {
        const a = n(u, v);
        const b = fbm(u, v, 40, 40, 5, 2);
        const k = 1 - contrast / 2 + a * contrast + (b - 0.5) * 0.18;
        return [base[0] * k, base[1] * k, base[2] * (k * 1.03)];
      },
      true,
      repeat,
    ),
    rough: paint(
      512,
      (u, v) => {
        const g = 255 * (0.42 + n(u, v) * 0.45);
        return [g, g, g];
      },
      false,
      repeat,
    ),
    bump: paint(
      512,
      (u, v) => {
        const g = 255 * fbm(u, v, 30, 30, 8, 3);
        return [g, g, g];
      },
      false,
      repeat,
    ),
  };
}

export function concreteSet(repeat: [number, number]): MapSet {
  const n = (u: number, v: number) => fbm(u, v, 6, 6, 77, 5);
  return {
    map: paint(
      512,
      (u, v, x, y) => {
        const a = n(u, v);
        const speck = hash(x, y, 4) > 0.997 ? -22 : 0;
        const k = 0.5 + a * 0.55;
        return [98 * k + speck, 100 * k + speck, 104 * k + speck];
      },
      true,
      repeat,
    ),
    rough: paint(
      512,
      (u, v) => {
        const g = 255 * (0.7 + n(u, v) * 0.3);
        return [g, g, g];
      },
      false,
      repeat,
    ),
    bump: paint(
      512,
      (u, v) => {
        const g = 255 * fbm(u, v, 18, 18, 12, 4);
        return [g, g, g];
      },
      false,
      repeat,
    ),
  };
}

export function brickSet(repeat: [number, number]): MapSet {
  const W = 1024;
  const mk = (colored: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = W;
    const x = c.getContext('2d')!;
    x.fillStyle = colored ? '#8c877c' : '#202020';
    x.fillRect(0, 0, W, W);
    const rows = 8,
      cols = 4;
    const bh = W / rows,
      bw = W / cols;
    for (let r = 0; r < rows; r++)
      for (let k = -1; k <= cols; k++) {
        const off = r % 2 ? bw / 2 : 0;
        const rnd = hash(k + 10, r + 3, 99);
        const bx = k * bw + off + 4;
        const by = r * bh + 4;
        if (colored) {
          const l = 38 + rnd * 16;
          x.fillStyle = `hsl(${12 + rnd * 12}, ${28 + rnd * 12}%, ${l}%)`;
        } else x.fillStyle = `rgb(${150 + rnd * 70},${150 + rnd * 70},${150 + rnd * 70})`;
        x.fillRect(bx, by, bw - 8, bh - 8);
      }
    return c;
  };
  const col = mk(true);
  // add speckle noise on top of brick colour
  const ctx = col.getContext('2d')!;
  const img = ctx.getImageData(0, 0, W, W);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (hash(i / 4, 7, 5) - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const bump = mk(false);
  const r = document.createElement('canvas');
  r.width = r.height = 64;
  const rc = r.getContext('2d')!;
  rc.fillStyle = '#e6e6e6';
  rc.fillRect(0, 0, 64, 64);
  return { map: finish(col, true, repeat), bump: finish(bump, false, repeat), rough: finish(r, false, repeat) };
}

/** Dial for the pressure gauge: 0–6 bar. */
export function gaugeDial(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4f2ea';
  x.beginPath();
  x.arc(256, 256, 250, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#1a1a1a';
  x.fillStyle = '#1a1a1a';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 34px sans-serif';
  for (let i = 0; i <= 6; i++) {
    const a = (-225 + (i / 6) * 270) * (Math.PI / 180);
    const cx = 256 + Math.cos(a),
      cy = 256 - Math.sin(a);
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(256 + Math.cos(a) * 200, 256 - Math.sin(a) * 200);
    x.lineTo(256 + Math.cos(a) * 232, 256 - Math.sin(a) * 232);
    x.stroke();
    x.fillText(String(i), 256 + Math.cos(a) * 160, 256 - Math.sin(a) * 160);
    void cx;
    void cy;
  }
  x.font = 'bold 30px sans-serif';
  x.fillText('BAR', 256, 360);
  x.fillStyle = '#c0392b';
  x.beginPath();
  x.arc(256, 256, 250, (-45 * Math.PI) / 180, (45 * Math.PI) / 180);
  x.lineTo(256, 256);
  x.fill();
  x.fillStyle = '#f4f2ea';
  x.beginPath();
  x.arc(256, 256, 232, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
