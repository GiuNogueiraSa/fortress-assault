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
// Destroço da explosão: lasca pequena e achatada, na cor da trincheira
export function buildDebris() {
  return new Float32Array(buildBox(0.17, 0.08, 0.13, [0,0,0], [0.50, 0.42, 0.28]));
}

