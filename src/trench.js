// ---------- Trincheira inimiga destrutível ----------
// Geometria simples: 9 segmentos (caixas) lado a lado. Os buracos NÃO mexem na
// geometria: cada impacto entra numa lista (centro no plano do muro, raio,
// semente) enviada ao fragment shader da trincheira (fs_trench em lighting.js),
// que descarta os pixels dentro do raio perturbado por ruído -> borda rasgada,
// com faixa queimada em volta.
// Colisão: caixa do segmento MENOS os buracos (raio médio), para o tiro passar
// por onde a parede foi destruída. O contorno rasgado existe só no shader; a
// colisão usa o círculo de raio médio que ele perturba.
import { buildBox } from "./geometry.js";

export const TRENCH_SEGMENTS = 9;
export const TRENCH_SPACING = 0.8;
export const TRENCH_WIDTH = TRENCH_SEGMENTS * TRENCH_SPACING; // 7.2
export const TRENCH_HEIGHT = 3.5;
export const TRENCH_DEPTH = 0.6;
export const TRENCH_Z = -6;          // onde ficava o alvo original
const COLORS = [[0.55, 0.47, 0.32], [0.46, 0.39, 0.26]]; // sacos de areia, tons alternados

// Buracos: raio sorteado por impacto; até MAX_HOLES na lista do shader
export const MAX_HOLES = 32;
export const HOLE_RADIUS_MIN = 0.4;
export const HOLE_RADIUS_MAX = 0.8;
// Reconstrói com essa fração destruída, ou quando a lista de buracos lota
export const TRENCH_REBUILD_DESTROYED = 0.6;

// Entulho estático no chão, ao pé do buraco
const RUBBLE_PER_HOLE_MIN = 4, RUBBLE_PER_HOLE_MAX = 8;
export const RUBBLE_COLOR = [0.47, 0.40, 0.27];

const LEFT = -TRENCH_WIDTH / 2;

export function createTrench() {
  const segments = Array.from({ length: TRENCH_SEGMENTS }, (_, i) => ({
    min: [LEFT + i * TRENCH_SPACING, 0, TRENCH_Z - TRENCH_DEPTH / 2],
    max: [LEFT + (i + 1) * TRENCH_SPACING, TRENCH_HEIGHT, TRENCH_Z + TRENCH_DEPTH / 2],
  }));
  return { segments, holes: [] };
}

export function resetTrench(trench) {
  trench.holes.length = 0;
}

export function trenchFull(trench) {
  return trench.holes.length >= MAX_HOLES;
}

const inHole = (trench, x, y) => trench.holes.some(h => Math.hypot(x - h.x, y - h.y) < h.r);

// O ponto está dentro de um segmento, fora dos buracos?
export function trenchHitTest(trench, pos) {
  const [x, y, z] = pos;
  const inSegment = trench.segments.some(s =>
    x >= s.min[0] && x < s.max[0] && y >= s.min[1] && y < s.max[1] && z >= s.min[2] && z < s.max[2]);
  return inSegment && !inHole(trench, x, y);
}

// Centro do buraco para um projétil em pos com velocidade vel: onde a trajetória
// cruza o plano do MEIO da espessura do muro. Tiro inclinado entra na frente numa
// altura e sai atrás noutra; no meio, o buraco cobre o caminho todo.
export function holeCenter(pos, vel) {
  if (Math.abs(vel[2]) < 1e-3) return pos;
  const t = (TRENCH_Z - pos[2]) / vel[2];
  return [pos[0] + vel[0] * t, pos[1] + vel[1] * t, TRENCH_Z];
}

// Registra um impacto: raio sorteado e semente do ruído (formato único por buraco)
export function addHole(trench, center, rand = Math.random) {
  const hole = {
    x: center[0],
    y: center[1],
    r: HOLE_RADIUS_MIN + rand() * (HOLE_RADIUS_MAX - HOLE_RADIUS_MIN),
    seed: rand() * 100,
  };
  if (trench.holes.length < MAX_HOLES) trench.holes.push(hole);
  return hole;
}

// Fração da face do muro coberta por buracos (amostrando uma grade de pontos)
export function trenchDestroyed(trench) {
  let hit = 0, total = 0;
  for (let y = 0.05; y < TRENCH_HEIGHT; y += 0.1) {
    for (let x = LEFT + 0.05; x < -LEFT; x += 0.1) {
      total++;
      if (inHole(trench, x, y)) hit++;
    }
  }
  return hit / total;
}

// Dados do uniform "Holes" do shader: count (vec4) + MAX_HOLES x vec4(x, y, raio, semente)
export const HOLES_UNIFORM_BYTES = (1 + MAX_HOLES) * 16;
export function holesUniformData(trench) {
  const d = new Float32Array(HOLES_UNIFORM_BYTES / 4);
  d[0] = trench.holes.length;
  trench.holes.forEach((h, i) => d.set([h.x, h.y, h.r, h.seed], 4 + i * 4));
  return d;
}

// Malha estática dos segmentos, em coordenadas de mundo
export function buildTrenchMesh() {
  let verts = [];
  for (let i = 0; i < TRENCH_SEGMENTS; i++) {
    const cx = LEFT + (i + 0.5) * TRENCH_SPACING;
    // segmentos encostados (sem fresta: pela fresta via-se o chão atrás do muro);
    // a divisão aparece pela alternância de cor
    verts = verts.concat(buildBox(TRENCH_SPACING, TRENCH_HEIGHT, TRENCH_DEPTH,
      [cx, TRENCH_HEIGHT / 2, TRENCH_Z], COLORS[i % 2]));
  }
  return new Float32Array(verts);
}

// Entulho estático ao pé do buraco, no chão dos dois lados do muro
// (mais do lado para onde o tiro ia).
export function rubbleForHole(center, radius, shotVel, rand = Math.random) {
  const n = RUBBLE_PER_HOLE_MIN + Math.floor(rand() * (RUBBLE_PER_HOLE_MAX - RUBBLE_PER_HOLE_MIN + 1));
  const behind = shotVel[2] < 0 ? -1 : 1;
  const pieces = [];
  for (let k = 0; k < n; k++) {
    const size = 0.16 + rand() * 0.16;
    const side = rand() < 0.6 ? behind : -behind;
    pieces.push({
      pos: [
        center[0] + (rand() - 0.5) * radius * 1.8,
        0,
        TRENCH_Z + side * (TRENCH_DEPTH / 2 + 0.05 + rand() * 0.6),
      ],
      size,
    });
  }
  return pieces;
}
