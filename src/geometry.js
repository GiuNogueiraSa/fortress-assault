// ---------- Geometria ----------
// Primitivas geradas na CPU. Cada vértice = [x, y, z, nx, ny, nz, r, g, b]:
// posição, normal REAL da face e cor base. A iluminação é calculada no
// fragment shader (src/lighting.js), não mais "assada" na cor.
export const FLOATS_PER_VERTEX = 9;

function pushTri(verts, a, b, c, normal, color, center) {
  for (const p of [a, b, c]) {
    verts.push(p[0]+center[0], p[1]+center[1], p[2]+center[2],
               normal[0], normal[1], normal[2], color[0], color[1], color[2]);
  }
}
export function pushQuad(verts, p0, p1, p2, p3, normal, color, center) {
  pushTri(verts, p0, p1, p2, normal, color, center);
  pushTri(verts, p0, p2, p3, normal, color, center);
}
// As 6 faces de uma caixa centrada na origem: cantos (c) e normal (n).
// Ordem: +Z, -Z, +X, -X, +Y, -Y.
export function boxFaces(hx, hy, hz) {
  return [
    { c: [[-hx,-hy, hz],[ hx,-hy, hz],[ hx, hy, hz],[-hx, hy, hz]], n: [0,0,1] },
    { c: [[ hx,-hy,-hz],[-hx,-hy,-hz],[-hx, hy,-hz],[ hx, hy,-hz]], n: [0,0,-1] },
    { c: [[ hx,-hy, hz],[ hx,-hy,-hz],[ hx, hy,-hz],[ hx, hy, hz]], n: [1,0,0] },
    { c: [[-hx,-hy,-hz],[-hx,-hy, hz],[-hx, hy, hz],[-hx, hy,-hz]], n: [-1,0,0] },
    { c: [[-hx, hy, hz],[ hx, hy, hz],[ hx, hy,-hz],[-hx, hy,-hz]], n: [0,1,0] },
    { c: [[-hx,-hy,-hz],[ hx,-hy,-hz],[ hx,-hy, hz],[-hx,-hy, hz]], n: [0,-1,0] },
  ];
}
export function buildBox(sizeX, sizeY, sizeZ, center, color) {
  const verts = [];
  for (const f of boxFaces(sizeX/2, sizeY/2, sizeZ/2)) pushQuad(verts, f.c[0], f.c[1], f.c[2], f.c[3], f.n, color, center);
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
// Pedaço de escombro: poliedro irregular de "raio" ~0.5 (tamanho ~1).
// Parte de um icosaedro (12 vértices, 20 faces), empurra cada vértice para
// dentro/fora por um fator aleatório e estica cada eixo por um fator diferente
// (achatado/alongado). Normais por face (facetado, cara de pedra quebrada).
// Cada chamada gera uma forma única.
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS = [
  [-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0],
  [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T],
  [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1],
];
const ICO_FACES = [
  [0,11,5], [0,5,1], [0,1,7], [0,7,10], [0,10,11], [1,5,9], [5,11,4], [11,10,2], [10,7,6], [7,1,8],
  [3,9,4], [3,4,2], [3,2,6], [3,6,8], [3,8,9], [4,9,5], [2,4,11], [6,2,10], [8,6,7], [9,8,1],
];
export function buildRock(color, rand = Math.random) {
  const stretch = [0.55 + rand() * 0.75, 0.45 + rand() * 0.6, 0.55 + rand() * 0.75];
  const pts = ICO_VERTS.map(v => {
    const l = Math.hypot(...v);
    const r = 0.5 * (0.65 + rand() * 0.55);            // deslocamento radial aleatório
    return v.map((c, k) => (c / l) * r * stretch[k]);
  });
  const verts = [];
  for (const [a, b, c] of ICO_FACES) {
    const A = pts[a], B = pts[b], C = pts[c];
    const u = [B[0]-A[0], B[1]-A[1], B[2]-A[2]], w = [C[0]-A[0], C[1]-A[1], C[2]-A[2]];
    let n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
    const centroid = [(A[0]+B[0]+C[0])/3, (A[1]+B[1]+C[1])/3, (A[2]+B[2]+C[2])/3];
    if (n[0]*centroid[0] + n[1]*centroid[1] + n[2]*centroid[2] < 0) n = n.map(x => -x); // para fora
    const l = Math.hypot(...n) || 1;
    // leve variação de tom por face: pedra não tem cor chapada
    const tone = 0.85 + rand() * 0.3;
    pushTri(verts, A, B, C, n.map(x => x / l), color.map(c => c * tone), [0, 0, 0]);
  }
  return new Float32Array(verts);
}

