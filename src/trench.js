// ---------- Fortaleza inimiga destrutível (antiga "trincheira") ----------
// Inspirada em castelos medievais: duas torres cilíndricas com ameias
// flanqueando um portão em ARCO (com passagem que atravessa a muralha),
// muralha frontal com ameias, muralhas laterais e de fundo fechando um pátio.
// Os buracos NÃO mexem na geometria: cada impacto entra numa lista enviada ao
// fragment shader (fs_trench em lighting.js), que descarta os pixels dentro de
// um raio perturbado por ruído (borda rasgada) com faixa queimada em volta.
// Cada buraco guarda a fatia de profundidade (zMin..zMax) da caixa atingida.
// Colisão do projétil: caixas sólidas (o arco do portão é recortado) MENOS os
// buracos. Colisão do tanque: círculo contra o que toca o chão.
import { buildBox, buildCylinderY } from "./geometry.js";

// ---------- Dimensões (largura total ~20, torres até ~15, pátio ~9 de fundo) ----------
export const FORT_HEIGHT = 10;                // muralha frontal
export const FRONT_Z = -9;                    // face externa da muralha frontal
export const WALL_T = 1.2;                    // espessura (= profundidade da passagem do portão)
const HALF_W = 10;
const BACK_Z = -17;                           // face interna da muralha do fundo
const SIDE_H = 9;
export const GATE_HALF_W = 1.25;              // portão: 2.5 de largura
const GATE_SPRING = 1.75;                     // altura onde começa o arco
export const GATE_H = GATE_SPRING + GATE_HALF_W; // 3.0 no topo do arco
export const TOWERS = [-2.95, 2.95].map(x => ({ x, z: FRONT_Z - WALL_T / 2, r: 1.65, h: 13.5 }));
const MERLON_H = 0.8;
// Pátio interno: região onde a luz fica amarela/quente (lighting.js)
export const COURTYARD = { xMin: -HALF_W + 1.0, xMax: HALF_W - 1.0, zMin: BACK_Z, zMax: FRONT_Z - WALL_T };

// Topo do arco do portão em função de x (semicírculo sobre os pés-direitos)
export const archY = x => GATE_SPRING + Math.sqrt(Math.max(0, GATE_HALF_W * GATE_HALF_W - x * x));

// ---------- Paleta (azul, verde, vermelho/rosa, amarelo) ----------
const BLUE = [0.15, 0.25, 0.50];
const BLUE_TOWER = [0.14, 0.235, 0.48];
const BLUE_DOOR = [0.10, 0.17, 0.36];
const YELLOW = [0.90, 0.85, 0.10];

// ---------- Buracos ----------
export const MAX_HOLES = 40;
export const HOLE_RADIUS_MIN = 0.4;
export const HOLE_RADIUS_MAX = 0.8;
export const DOOR_HP = 3;
export const TRENCH_REBUILD_DESTROYED = 0.5;

const RUBBLE_PER_HOLE_MIN = 4, RUBBLE_PER_HOLE_MAX = 8;
// Destroços (o shader multiplica a cor base cinza 0.5 pela tinta):
// pedaços azuis de parede, com hera verde, e alguns com flor vermelha/rosa
export const DEBRIS_TINTS = [
  { tint: [0.30, 0.50, 1.00], weight: 0.55 },
  { tint: [0.10, 0.50, 0.16], weight: 0.33 },
  { tint: [1.20, 0.20, 0.30], weight: 0.07 },
  { tint: [1.50, 0.40, 0.70], weight: 0.05 },
];
export function randomDebrisTint(rand = Math.random) {
  let r = rand();
  const pick = DEBRIS_TINTS.find(t => (r -= t.weight) < 0) || DEBRIS_TINTS[0];
  const k = 0.7 + rand() * 0.5;
  return pick.tint.map(c => c * k);
}

// ---------- Montagem ----------
const box = (x0, y0, z0, x1, y1, z1, color, extra = {}) =>
  ({ min: [x0, y0, z0], max: [x1, y1, z1], color, destructible: true, ...extra });

// ameias ao longo de x (ou z), pulando trechos cobertos pelas torres
function merlonsX(x0, x1, y, z0, z1, color, skip = () => false) {
  const out = [];
  for (let x = x0; x < x1 - 0.2; x += 1.25) {
    const xe = Math.min(x + 0.7, x1);
    if (!skip((x + xe) / 2)) out.push(box(x, y, z0, xe, y + MERLON_H, z1, color, { destructible: false, merlon: true }));
  }
  return out;
}
function merlonsZ(z0, z1, y, x0, x1, color) {
  const out = [];
  for (let z = z0; z < z1 - 0.2; z += 1.25) {
    out.push(box(x0, y, z, x1, y + MERLON_H, Math.min(z + 0.7, z1), color, { destructible: false, merlon: true }));
  }
  return out;
}

function fortressBoxes() {
  const fz0 = FRONT_Z - WALL_T, fz1 = FRONT_Z;
  const underTower = x => TOWERS.some(t => Math.abs(x - t.x) < t.r + 0.1);
  const b = [
    // muralha frontal: esquerda, direita e o trecho sobre o portão (recortado em arco)
    box(-HALF_W, 0, fz0, -GATE_HALF_W, FORT_HEIGHT, fz1, BLUE),
    box(GATE_HALF_W, 0, fz0, HALF_W, FORT_HEIGHT, fz1, BLUE),
    box(-GATE_HALF_W, GATE_SPRING, fz0, GATE_HALF_W, FORT_HEIGHT, fz1, BLUE, { arch: true, noMesh: true }),
    // muralhas do pátio: laterais (sólidas) e fundo
    box(-HALF_W, 0, BACK_Z - 1.0, -HALF_W + 1.0, SIDE_H, fz0, BLUE, { destructible: false }),
    box(HALF_W - 1.0, 0, BACK_Z - 1.0, HALF_W, SIDE_H, fz0, BLUE, { destructible: false }),
    box(-HALF_W, 0, BACK_Z - 1.0, HALF_W, SIDE_H, BACK_Z, BLUE),
    // canteiro no meio do pátio
    // (longe o bastante da muralha frontal para o tanque passar entre os dois)
    box(-1.5, 0, -15.6, 1.5, 0.8, -13.8, BLUE_DOOR, { destructible: false }),
    ...merlonsX(-HALF_W, HALF_W, FORT_HEIGHT, fz0, fz1, BLUE, underTower),
    ...merlonsX(-HALF_W, HALF_W, SIDE_H, BACK_Z - 1.0, BACK_Z, BLUE),
    ...merlonsZ(BACK_Z - 1.0, fz0, SIDE_H, -HALF_W, -HALF_W + 1.0, BLUE),
    ...merlonsZ(BACK_Z - 1.0, fz0, SIDE_H, HALF_W - 1.0, HALF_W, BLUE),
  ];
  // torres: colisão aproximada por caixa (a malha é cilíndrica)
  for (const t of TOWERS) {
    b.push(box(t.x - t.r, 0, t.z - t.r, t.x + t.r, t.h + MERLON_H, t.z + t.r, BLUE_TOWER,
      { destructible: false, tower: true, noMesh: true }));
  }
  return b;
}
// Portão: folha em arco, no meio da passagem (cai depois de DOOR_HP acertos)
const DOOR = box(-GATE_HALF_W, 0, FRONT_Z - WALL_T / 2 - 0.15, GATE_HALF_W, GATE_H, FRONT_Z - WALL_T / 2 + 0.15,
  BLUE_DOOR, { door: true });

export function createTrench() {
  return { boxes: fortressBoxes(), door: DOOR, doorHits: 0, doorOpen: false, holes: [] };
}

export function resetTrench(trench) {
  trench.holes.length = 0;
  trench.doorHits = 0;
  trench.doorOpen = false;
}

export function trenchFull(trench) {
  return trench.holes.length >= MAX_HOLES;
}

const inside = (b, p) => {
  if (!(p[0] >= b.min[0] && p[0] < b.max[0] && p[1] >= b.min[1] && p[1] < b.max[1] &&
        p[2] >= b.min[2] && p[2] < b.max[2])) return false;
  if (b.arch && p[1] < archY(p[0])) return false;        // vão do arco
  if (b.tower) return TOWERS.some(t => Math.hypot(p[0] - t.x, p[2] - t.z) < t.r) || p[1] >= TOWERS[0].h;
  return true;
};

const inHole = (trench, p) => trench.holes.some(h =>
  p[2] >= h.zMin - 0.05 && p[2] <= h.zMax + 0.05 && Math.hypot(p[0] - h.x, p[1] - h.y) < h.r);

function solidBoxes(trench) {
  return trench.doorOpen ? trench.boxes : [...trench.boxes, trench.door];
}

// Caixa sólida que contém o ponto (fora dos buracos), ou null. O portão não
// deixa passar pelos furos (são só dano visual) e bloqueia até cair.
export function trenchHitTest(trench, pos) {
  const holed = inHole(trench, pos);
  for (const b of solidBoxes(trench)) {
    if (inside(b, pos) && !(holed && b.destructible && !b.door)) return b;
  }
  return null;
}

// O tanque (círculo de raio r no chão) bate em algo que toca o chão?
export function tankBlocked(trench, x, z, r = 1.1) {
  for (const b of solidBoxes(trench)) {
    if (b.min[1] >= 1.0) continue;   // ameias, arco: acima do tanque
    if (b.tower) {
      if (TOWERS.some(t => Math.hypot(x - t.x, z - t.z) < t.r + r)) return true;
      continue;
    }
    if (x > b.min[0] - r && x < b.max[0] + r && z > b.min[2] - r && z < b.max[2] + r) return true;
  }
  return false;
}

// Centro do buraco: onde a trajetória cruza o plano do meio da caixa atingida
export function holeCenter(pos, vel, b) {
  const midZ = (b.min[2] + b.max[2]) / 2;
  if (Math.abs(vel[2]) < 1e-3) return pos;
  const t = (midZ - pos[2]) / vel[2];
  return [pos[0] + vel[0] * t, pos[1] + vel[1] * t, midZ];
}

export function addHole(trench, center, b, rand = Math.random) {
  let doorFell = false;
  if (b.door) {
    trench.doorHits++;
    if (trench.doorHits >= DOOR_HP) { trench.doorOpen = true; doorFell = true; }
  }
  if (!b.destructible) return { hole: null, doorFell };
  const hole = {
    x: center[0], y: center[1],
    r: b.door ? 0.22 + rand() * 0.1 : HOLE_RADIUS_MIN + rand() * (HOLE_RADIUS_MAX - HOLE_RADIUS_MIN),
    seed: rand() * 100,
    zMin: b.min[2], zMax: b.max[2],
  };
  if (trench.holes.length < MAX_HOLES) trench.holes.push(hole);
  return { hole, doorFell };
}

// Fração da fachada frontal (fora o portão e as torres) coberta por buracos
export function trenchDestroyed(trench) {
  let hit = 0, total = 0;
  const z = FRONT_Z - WALL_T / 2;
  for (let y = 0.15; y < FORT_HEIGHT; y += 0.3) {
    for (let x = -HALF_W + 0.15; x < HALF_W; x += 0.3) {
      if (Math.abs(x) < GATE_HALF_W && y < GATE_H) continue;
      if (TOWERS.some(t => Math.abs(x - t.x) < t.r)) continue;
      total++;
      if (inHole(trench, [x, y, z])) hit++;
    }
  }
  return hit / total;
}

export const HOLES_UNIFORM_BYTES = (1 + 2 * MAX_HOLES) * 16;
export function holesUniformData(trench) {
  const d = new Float32Array(HOLES_UNIFORM_BYTES / 4);
  d[0] = trench.holes.length;
  trench.holes.forEach((h, i) => {
    d.set([h.x, h.y, h.r, h.seed], 4 + i * 8);
    d.set([h.zMin, h.zMax, 0, 0], 8 + i * 8);
  });
  return d;
}

// ---------- Malhas ----------
const boxVerts = b => buildBox(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2],
  [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], b.color);

// Trecho da muralha sobre o portão, recortado em arco: faces da frente e de
// trás (do arco até o topo) e o intradorso (teto curvo da passagem).
function archVerts(color, segs = 18) {
  const v = [];
  const zf = FRONT_Z, zb = FRONT_Z - WALL_T, top = FORT_HEIGHT;
  const push = (p, n) => v.push(...p, ...n, ...color);
  for (let i = 0; i < segs; i++) {
    const x0 = -GATE_HALF_W + (2 * GATE_HALF_W * i) / segs, x1 = -GATE_HALF_W + (2 * GATE_HALF_W * (i + 1)) / segs;
    const y0 = archY(x0), y1 = archY(x1);
    for (const [z, nz] of [[zf, 1], [zb, -1]]) {
      const n = [0, 0, nz];
      push([x0, y0, z], n); push([x1, y1, z], n); push([x1, top, z], n);
      push([x0, y0, z], n); push([x1, top, z], n); push([x0, top, z], n);
    }
    // intradorso: normal apontando para o centro do arco (para baixo/dentro)
    const nOf = x => { const dx = -x, dy = GATE_SPRING - archY(x); const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, 0]; };
    const na = nOf(x0), nb = nOf(x1);
    push([x0, y0, zf], na); push([x1, y1, zf], nb); push([x1, y1, zb], nb);
    push([x0, y0, zf], na); push([x1, y1, zb], nb); push([x0, y0, zb], na);
  }
  return v;
}

// Folha do portão em arco: retângulo + meia-lua (leque de triângulos), frente e verso
function doorVerts(color) {
  const v = [];
  const segs = 18;
  for (const [z, nz] of [[DOOR.max[2], 1], [DOOR.min[2], -1]]) {
    const n = [0, 0, nz];
    const push = p => v.push(...p, ...n, ...color);
    push([-GATE_HALF_W, 0, z]); push([GATE_HALF_W, 0, z]); push([GATE_HALF_W, GATE_SPRING, z]);
    push([-GATE_HALF_W, 0, z]); push([GATE_HALF_W, GATE_SPRING, z]); push([-GATE_HALF_W, GATE_SPRING, z]);
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI * i / segs, a1 = Math.PI * (i + 1) / segs;
      push([0, GATE_SPRING, z]);
      push([Math.cos(a0) * GATE_HALF_W, GATE_SPRING + Math.sin(a0) * GATE_HALF_W, z]);
      push([Math.cos(a1) * GATE_HALF_W, GATE_SPRING + Math.sin(a1) * GATE_HALF_W, z]);
    }
  }
  return v;
}

// Torre: cilindro de normais suaves + anel saliente perto do topo + ameias em volta
function towerVerts(t) {
  let v = buildCylinderY(t.r, t.h, [t.x, 0, t.z], BLUE_TOWER, 28);
  v = v.concat(buildCylinderY(t.r + 0.18, 0.55, [t.x, t.h - 1.0, t.z], BLUE_TOWER, 28)); // anel (mata-cães)
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cx = t.x + Math.cos(a) * (t.r - 0.25), cz = t.z + Math.sin(a) * (t.r - 0.25);
    v = v.concat(buildBox(0.55, MERLON_H, 0.55, [cx, t.h + MERLON_H / 2, cz], BLUE_TOWER));
  }
  return v;
}

export function buildTrenchMesh(trench) {
  let walls = [];
  for (const b of trench.boxes) if (!b.noMesh) walls = walls.concat(boxVerts(b));
  walls = walls.concat(archVerts(BLUE));
  for (const t of TOWERS) walls = walls.concat(towerVerts(t));
  // portão em arco + dobradiças e trinco amarelos
  let door = doorVerts(BLUE_DOOR);
  const front = DOOR.max[2] + 0.04;
  for (const y of [0.6, 2.0]) {
    door = door.concat(buildBox(0.9, 0.12, 0.08, [-GATE_HALF_W + 0.5, y, front], YELLOW));
    door = door.concat(buildBox(0.9, 0.12, 0.08, [GATE_HALF_W - 0.5, y, front], YELLOW));
  }
  door = door.concat(buildBox(0.14, 0.4, 0.1, [0.25, 1.4, front], YELLOW));
  return { walls: new Float32Array(walls), door: new Float32Array(door) };
}

export function rubbleForHole(center, radius, shotVel, b, rand = Math.random) {
  const n = RUBBLE_PER_HOLE_MIN + Math.floor(rand() * (RUBBLE_PER_HOLE_MAX - RUBBLE_PER_HOLE_MIN + 1));
  const behind = shotVel[2] < 0 ? -1 : 1;
  const pieces = [];
  for (let k = 0; k < n; k++) {
    const size = 0.10 + rand() * 0.12;
    const side = rand() < 0.6 ? behind : -behind;
    const face = side < 0 ? b.min[2] : b.max[2];
    pieces.push({ pos: [center[0] + (rand() - 0.5) * radius * 1.8, 0, face + side * (0.05 + rand() * 0.6)], size });
  }
  return pieces;
}
