// ---------- Fortaleza inimiga destrutível (antiga "trincheira") ----------
// Geometria: caixas simples (parede frontal com portão, torres de guarda,
// ameias, paredes laterais/fundo de um pátio interno). Os buracos NÃO mexem na
// geometria: cada impacto entra numa lista enviada ao fragment shader
// (fs_trench em lighting.js), que descarta os pixels dentro de um raio
// perturbado por ruído (borda rasgada) com faixa queimada em volta.
// Cada buraco guarda a "fatia" de profundidade (zMin..zMax) da caixa onde
// nasceu, para não furar também a parede do fundo no mesmo x,y.
// Colisão do projétil: caixa sólida MENOS os buracos (raio médio).
// Colisão do tanque: círculo contra as caixas (o portão bloqueia até cair).
import { buildBox } from "./geometry.js";

// ---------- Dimensões ----------
export const FORT_HEIGHT = 9;                 // parede frontal (as torres são mais altas)
export const FRONT_Z = -9;                    // face externa da parede frontal
const WALL_T = 0.8;                           // espessura das paredes
const HALF_W = 7.8;                           // meia largura externa
const BACK_Z = -18;                           // face interna da parede do fundo
const SIDE_H = 7.5;                           // altura das paredes do pátio
export const GATE_HALF_W = 1.25;              // portão: 2.5 de largura
export const GATE_H = 3;                      // e 3 de altura
const TOWER = { x0: 1.6, x1: 3.2, front: FRONT_Z + 0.8, h: 10.5 };
// Pátio interno: região onde a luz fica amarela/quente (lighting.js)
export const COURTYARD = { xMin: -HALF_W + WALL_T, xMax: HALF_W - WALL_T, zMin: BACK_Z, zMax: FRONT_Z - WALL_T };

// ---------- Paleta (só azul, verde, vermelho/rosa, amarelo; preto/branco mínimo) ----------
const BLUE = [0.15, 0.25, 0.50];
const BLUE_TOWER = [0.13, 0.22, 0.46];
const BLUE_DARK = [0.10, 0.17, 0.36];          // portão e friso
const YELLOW = [0.90, 0.85, 0.10];             // dobradiças/trinco do portão (detalhe mínimo)

// ---------- Buracos ----------
export const MAX_HOLES = 40;
export const HOLE_RADIUS_MIN = 0.4;
export const HOLE_RADIUS_MAX = 0.8;
export const DOOR_HP = 3;                      // acertos para derrubar o portão
// Reconstrói com essa fração da fachada destruída, ou quando a lista lota
export const TRENCH_REBUILD_DESTROYED = 0.5;

// Entulho estático no chão, ao pé do buraco
const RUBBLE_PER_HOLE_MIN = 4, RUBBLE_PER_HOLE_MAX = 8;
// Cores dos destroços (o shader multiplica a cor base cinza 0.5 pela tinta):
// pedaços de parede azul, alguns com hera verde presa
export const DEBRIS_TINTS = [
  { tint: [0.30, 0.50, 1.00], weight: 0.65 },
  { tint: [0.10, 0.50, 0.16], weight: 0.35 },
];
export function randomDebrisTint(rand = Math.random) {
  let r = rand();
  const pick = DEBRIS_TINTS.find(t => (r -= t.weight) < 0) || DEBRIS_TINTS[0];
  const k = 0.7 + rand() * 0.5;   // mais claro / mais escuro (mesma cor)
  return pick.tint.map(c => c * k);
}

// ---------- Montagem da fortaleza ----------
const box = (x0, y0, z0, x1, y1, z1, color, extra = {}) =>
  ({ min: [x0, y0, z0], max: [x1, y1, z1], color, destructible: true, ...extra });

function fortressBoxes() {
  const fz0 = FRONT_Z - WALL_T, fz1 = FRONT_Z;
  const b = [
    // parede frontal: esquerda, direita e verga acima do portão
    box(-HALF_W, 0, fz0, -GATE_HALF_W, FORT_HEIGHT, fz1, BLUE),
    box(GATE_HALF_W, 0, fz0, HALF_W, FORT_HEIGHT, fz1, BLUE),
    box(-GATE_HALF_W, GATE_H, fz0, GATE_HALF_W, FORT_HEIGHT, fz1, BLUE),
    // friso horizontal saliente (desnível na fachada)
    box(-HALF_W, 3.6, fz1, HALF_W, 3.85, fz1 + 0.15, BLUE_DARK, { destructible: false }),
    // torres de guarda dos lados do portão (saem 0.8 para fora)
    box(-TOWER.x1, 0, fz0, -TOWER.x0, TOWER.h, TOWER.front, BLUE_TOWER),
    box(TOWER.x0, 0, fz0, TOWER.x1, TOWER.h, TOWER.front, BLUE_TOWER),
    // paredes do pátio (laterais e fundo): sólidas, sem buracos
    box(-HALF_W, 0, BACK_Z - WALL_T, -HALF_W + WALL_T, SIDE_H, fz0, BLUE, { destructible: false }),
    box(HALF_W - WALL_T, 0, BACK_Z - WALL_T, HALF_W, SIDE_H, fz0, BLUE, { destructible: false }),
    box(-HALF_W, 0, BACK_Z - WALL_T, HALF_W, SIDE_H, BACK_Z, BLUE),
    // canteiro no meio do pátio (a hera cobre)
    box(-1.5, 0, -15, 1.5, 0.8, -13, BLUE_DARK, { destructible: false }),
  ];
  // ameias no topo da parede frontal e das torres
  for (let x = -HALF_W; x < HALF_W - 0.1; x += 1.3) {
    b.push(box(x, FORT_HEIGHT, fz0, Math.min(x + 0.7, HALF_W), FORT_HEIGHT + 0.8, fz1, BLUE));
  }
  for (const s of [-1, 1]) {
    const [a, c] = s < 0 ? [-TOWER.x1, -TOWER.x0] : [TOWER.x0, TOWER.x1];
    b.push(box(a, TOWER.h, TOWER.front - 0.5, a + 0.5, TOWER.h + 0.7, TOWER.front, BLUE_TOWER));
    b.push(box(c - 0.5, TOWER.h, TOWER.front - 0.5, c, TOWER.h + 0.7, TOWER.front, BLUE_TOWER));
  }
  return b;
}
// Portão: painel recuado dentro da abertura (cai depois de DOOR_HP acertos)
const DOOR = box(-GATE_HALF_W, 0, FRONT_Z - 0.55, GATE_HALF_W, GATE_H, FRONT_Z - 0.25, BLUE_DARK, { door: true });

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

const inside = (b, p, pad = 0) =>
  p[0] >= b.min[0] - pad && p[0] < b.max[0] + pad && p[1] >= b.min[1] && p[1] < b.max[1] &&
  p[2] >= b.min[2] - pad && p[2] < b.max[2] + pad;

const inHole = (trench, p) => trench.holes.some(h =>
  p[2] >= h.zMin - 0.05 && p[2] <= h.zMax + 0.05 && Math.hypot(p[0] - h.x, p[1] - h.y) < h.r);

function solidBoxes(trench) {
  return trench.doorOpen ? trench.boxes : [...trench.boxes, trench.door];
}

// Caixa sólida que contém o ponto (fora dos buracos), ou null
// (caixas que se sobrepõem, como torre + parede: basta uma não estar furada ali).
// O portão nunca deixa passar pelos buracos: neles os furos são só dano visual,
// e ele bloqueia inteiro até cair no DOOR_HP-ésimo acerto.
export function trenchHitTest(trench, pos) {
  const holed = inHole(trench, pos);
  for (const b of solidBoxes(trench)) {
    if (inside(b, pos) && !(holed && b.destructible && !b.door)) return b;
  }
  return null;
}

// O tanque (círculo de raio r no chão) bate em alguma caixa?
export function tankBlocked(trench, x, z, r = 1.1) {
  return solidBoxes(trench).some(b =>
    b.min[1] < 1.0 &&   // só o que encosta no chão (ameias/friso não)
    x > b.min[0] - r && x < b.max[0] + r && z > b.min[2] - r && z < b.max[2] + r);
}

// Centro do buraco: onde a trajetória cruza o plano do MEIO da espessura da
// caixa atingida (tiro inclinado entra numa altura e sai noutra; no meio, o
// buraco cobre o caminho todo).
export function holeCenter(pos, vel, b) {
  const midZ = (b.min[2] + b.max[2]) / 2;
  if (Math.abs(vel[2]) < 1e-3) return pos;
  const t = (midZ - pos[2]) / vel[2];
  return [pos[0] + vel[0] * t, pos[1] + vel[1] * t, midZ];
}

// Registra um impacto na caixa b. Devolve o buraco (ou null se a caixa não
// aceita buracos) e se o portão caiu com este acerto.
export function addHole(trench, center, b, rand = Math.random) {
  let doorFell = false;
  if (b.door) {
    trench.doorHits++;
    if (trench.doorHits >= DOOR_HP) { trench.doorOpen = true; doorFell = true; }
  }
  if (!b.destructible) return { hole: null, doorFell };
  const hole = {
    x: center[0], y: center[1],
    // no portão: furos menores (marcas de dano); nas paredes: buraco normal
    r: b.door ? 0.22 + rand() * 0.1 : HOLE_RADIUS_MIN + rand() * (HOLE_RADIUS_MAX - HOLE_RADIUS_MIN),
    seed: rand() * 100,
    zMin: b.min[2], zMax: b.max[2],
  };
  if (trench.holes.length < MAX_HOLES) trench.holes.push(hole);
  return { hole, doorFell };
}

// Fração da fachada (face da parede frontal, fora o vão do portão) coberta por buracos
export function trenchDestroyed(trench) {
  let hit = 0, total = 0;
  const z = FRONT_Z - WALL_T / 2;
  for (let y = 0.15; y < FORT_HEIGHT; y += 0.3) {
    for (let x = -HALF_W + 0.15; x < HALF_W; x += 0.3) {
      if (Math.abs(x) < GATE_HALF_W && y < GATE_H) continue;
      total++;
      if (inHole(trench, [x, y, z])) hit++;
    }
  }
  return hit / total;
}

// Dados do uniform "Holes": count (vec4) + MAX_HOLES x 2 vec4:
//   (x, y, raio, semente) e (zMin, zMax, 0, 0)
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

const boxVerts = b => buildBox(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2],
  [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], b.color);

// Malhas estáticas, em coordenadas de mundo: fortaleza e portão (separado, some ao cair)
export function buildTrenchMesh(trench) {
  let walls = [];
  for (const b of trench.boxes) walls = walls.concat(boxVerts(b));
  // portão: painel + dobradiças e trinco amarelos (único amarelo da fortaleza)
  const d = trench.door;
  let door = boxVerts(d);
  const front = d.max[2] + 0.04;
  for (const y of [0.6, 2.3]) {
    door = door.concat(buildBox(0.9, 0.12, 0.08, [-GATE_HALF_W + 0.5, y, front], YELLOW));
    door = door.concat(buildBox(0.9, 0.12, 0.08, [GATE_HALF_W - 0.5, y, front], YELLOW));
  }
  door = door.concat(buildBox(0.14, 0.4, 0.1, [0.25, 1.5, front], YELLOW));
  return { walls: new Float32Array(walls), door: new Float32Array(door) };
}

// Entulho estático ao pé do buraco, no chão dos dois lados da caixa atingida
// (mais do lado para onde o tiro ia).
export function rubbleForHole(center, radius, shotVel, b, rand = Math.random) {
  const n = RUBBLE_PER_HOLE_MIN + Math.floor(rand() * (RUBBLE_PER_HOLE_MAX - RUBBLE_PER_HOLE_MIN + 1));
  const behind = shotVel[2] < 0 ? -1 : 1;
  const pieces = [];
  for (let k = 0; k < n; k++) {
    const size = 0.10 + rand() * 0.12;
    const side = rand() < 0.6 ? behind : -behind;
    const face = side < 0 ? b.min[2] : b.max[2];
    pieces.push({
      pos: [center[0] + (rand() - 0.5) * radius * 1.8, 0, face + side * (0.05 + rand() * 0.6)],
      size,
    });
  }
  return pieces;
}
