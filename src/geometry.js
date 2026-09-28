// ---------- Geometria ----------
// Primitivas geradas na CPU. Cada vértice = [x, y, z, r, g, b] (6 floats).
// A "iluminação" é fixa por face (FAKE_LIGHT), já embutida na cor do vértice.

const FAKE_LIGHT = (() => {
  const v = [0.4, 1.0, 0.35];
  const l = Math.hypot(...v);
  return v.map(x => x / l);
})();
function shadeFor(n) {
  const d = n[0]*FAKE_LIGHT[0] + n[1]*FAKE_LIGHT[1] + n[2]*FAKE_LIGHT[2];
  return 0.45 + 0.55 * Math.max(d, 0);
}
function pushTri(verts, a, b, c, normal, color, center) {
  const shade = shadeFor(normal);
  const col = [color[0]*shade, color[1]*shade, color[2]*shade];
  for (const p of [a, b, c]) {
    verts.push(p[0]+center[0], p[1]+center[1], p[2]+center[2], col[0], col[1], col[2]);
  }
}
function pushQuad(verts, p0, p1, p2, p3, normal, color, center) {
  pushTri(verts, p0, p1, p2, normal, color, center);
  pushTri(verts, p0, p2, p3, normal, color, center);
}
export function buildBox(sizeX, sizeY, sizeZ, center, color) {
  const hx = sizeX/2, hy = sizeY/2, hz = sizeZ/2;
  const faces = [
    { c: [[-hx,-hy, hz],[ hx,-hy, hz],[ hx, hy, hz],[-hx, hy, hz]], n: [0,0,1] },
    { c: [[ hx,-hy,-hz],[-hx,-hy,-hz],[-hx, hy,-hz],[ hx, hy,-hz]], n: [0,0,-1] },
    { c: [[ hx,-hy, hz],[ hx,-hy,-hz],[ hx, hy,-hz],[ hx, hy, hz]], n: [1,0,0] },
    { c: [[-hx,-hy,-hz],[-hx,-hy, hz],[-hx, hy, hz],[-hx, hy,-hz]], n: [-1,0,0] },
    { c: [[-hx, hy, hz],[ hx, hy, hz],[ hx, hy,-hz],[-hx, hy,-hz]], n: [0,1,0] },
    { c: [[-hx,-hy,-hz],[ hx,-hy,-hz],[ hx,-hy, hz],[-hx,-hy, hz]], n: [0,-1,0] },
  ];
  const verts = [];
  for (const f of faces) pushQuad(verts, f.c[0], f.c[1], f.c[2], f.c[3], f.n, color, center);
  return verts;
}
export function buildCylinderX(radius, length, center, color, segments) {
  const hx = length/2;
  const step = (Math.PI*2)/segments;
  const verts = [];
  for (let i=0;i<segments;i++){
    const a0=i*step, a1=(i+1)*step;
    const y0=Math.cos(a0)*radius, z0=Math.sin(a0)*radius;
    const y1=Math.cos(a1)*radius, z1=Math.sin(a1)*radius;
    const am=(a0+a1)/2;
    const nrm=[0, Math.cos(am), Math.sin(am)];
    pushQuad(verts, [-hx,y0,z0],[hx,y0,z0],[hx,y1,z1],[-hx,y1,z1], nrm, color, center);
  }
  for (const side of [1,-1]) {
    const capCenter=[side*hx,0,0];
    const nrm=[side,0,0];
    for (let i=0;i<segments;i++){
      const a0=i*step, a1=(i+1)*step;
      const y0=Math.cos(a0)*radius, z0=Math.sin(a0)*radius;
      const y1=Math.cos(a1)*radius, z1=Math.sin(a1)*radius;
      pushTri(verts, capCenter, [side*hx,y0,z0], [side*hx,y1,z1], nrm, color, center);
    }
  }
  return verts;
}

// ---------- Objetos do cenário ----------
export function buildGround() {
  return new Float32Array(buildBox(30, 0.2, 30, [0,-0.1,0], [0.16, 0.27, 0.15]));
}
export function buildProjectile() {
  return new Float32Array(buildBox(0.16, 0.16, 0.16, [0,0,0], [0.08, 0.08, 0.09]));
}

// Trincheira inimiga: fileira de segmentos independentes ao longo de X, no
// lugar onde ficava o alvo (z = -6). A caixa desenhada é um pouco mais estreita
// que o espaçamento (fresta visual entre blocos), mas a colisão (AABB) cobre o
// espaçamento todo, para o projétil não "vazar" pela fresta.
export const TRENCH_SEGMENTS = 9;
export const TRENCH_SPACING = 0.8;
export const TRENCH_Z = -6;
export const TRENCH_SEGMENT_HALF = [TRENCH_SPACING / 2, 0.35, 0.3];
const TRENCH_VISUAL_WIDTH = 0.74;
const TRENCH_COLORS = [[0.55, 0.47, 0.32], [0.46, 0.39, 0.26]]; // sacos de areia, alternando o tom

export function trenchSegmentPositions() {
  const first = -(TRENCH_SEGMENTS - 1) / 2 * TRENCH_SPACING;
  return Array.from({ length: TRENCH_SEGMENTS }, (_, i) =>
    [first + i * TRENCH_SPACING, TRENCH_SEGMENT_HALF[1], TRENCH_Z]);
}
export function buildTrenchSegment(index) {
  const h = TRENCH_SEGMENT_HALF;
  return new Float32Array(buildBox(TRENCH_VISUAL_WIDTH, h[1]*2, h[2]*2, [0,0,0], TRENCH_COLORS[index % 2]));
}
