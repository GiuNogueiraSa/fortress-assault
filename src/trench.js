// ---------- Trincheira inimiga destrutível (grade de células) ----------
// O muro é uma grade de células pequenas (CELL x CELL, atravessando a espessura
// toda) — cada bloco de 0.8 da versão antiga equivale a 8 x 35 células, cada uma
// com colisão própria. Cada impacto remove um grupo irregular de células ao redor
// do ponto, queima as células da borda e deixa entulho no chão.
// A mesma grade serve para desenhar e para a colisão: o projétil passa pelo
// buraco exatamente onde ele aparece na tela.
import { boxFaces, pushQuad, FLOATS_PER_VERTEX } from "./geometry.js";

export const TRENCH_WIDTH = 7.2;   // mesma largura dos 9 blocos de 0.8 da versão anterior
export const TRENCH_HEIGHT = 3.5;
export const TRENCH_DEPTH = 0.6;
export const TRENCH_Z = -6;        // onde ficava o alvo original
const CELL = 0.1;
// Buraco irregular: raio sorteado por impacto; dentro de HOLE_CORE * raio sai
// tudo, no anel da borda cada célula sai com EDGE_REMOVE_CHANCE de chance, e uma
// ondulação angular (HOLE_WOBBLE) tira o formato de círculo perfeito.
export const HOLE_RADIUS_MIN = 0.4;
export const HOLE_RADIUS_MAX = 0.8;
const HOLE_CORE = 0.75;
const EDGE_REMOVE_CHANCE = 0.7;
const HOLE_WOBBLE = 0.15;
// Marca de queimado: células que sobraram até BURN_WIDTH além da borda escurecem
const BURN_WIDTH = 0.25;
const BURN_COLOR = [0.10, 0.07, 0.05];
// Entulho estático no chão, ao pé do buraco
const RUBBLE_PER_HOLE_MIN = 4, RUBBLE_PER_HOLE_MAX = 8;
export const RUBBLE_COLOR = [0.47, 0.40, 0.27];
// Reconstrói quando sobrar menos que isso do muro
export const TRENCH_REBUILD_BELOW = 0.4;

const COLS = Math.round(TRENCH_WIDTH / CELL);
const ROWS = Math.round(TRENCH_HEIGHT / CELL);
const LEFT = -TRENCH_WIDTH / 2;
// Faixas de cor alternadas com a largura dos blocos antigos (0.8 = 8 células),
// só para dar referência visual de tamanho
const BAND_COLS = 8;
const COLORS = [[0.55, 0.47, 0.32], [0.46, 0.39, 0.26]];

// Pior caso da malha: todas as células com as 6 faces (6 vértices cada)
export const TRENCH_MAX_FLOATS = COLS * ROWS * 6 * 6 * FLOATS_PER_VERTEX;

export function createTrench() {
  return {
    alive: new Uint8Array(COLS * ROWS).fill(1),
    burn: new Float32Array(COLS * ROWS),   // 0 = cor normal, 1 = totalmente queimada
    aliveCount: COLS * ROWS,
  };
}

export function resetTrench(trench) {
  trench.alive.fill(1);
  trench.burn.fill(0);
  trench.aliveCount = COLS * ROWS;
}

export function trenchRemaining(trench) {
  return trench.aliveCount / (COLS * ROWS);
}

const isAlive = (trench, i, j) =>
  i >= 0 && i < COLS && j >= 0 && j < ROWS && trench.alive[j * COLS + i] === 1;

// O ponto está dentro de uma célula ainda de pé?
export function trenchHitTest(trench, pos) {
  if (Math.abs(pos[2] - TRENCH_Z) >= TRENCH_DEPTH / 2) return false;
  const i = Math.floor((pos[0] - LEFT) / CELL);
  const j = Math.floor(pos[1] / CELL);
  return isAlive(trench, i, j);
}

// Centro do buraco para um projétil em pos com velocidade vel: onde a trajetória
// cruza o plano do MEIO da espessura do muro. Tiro inclinado entra na frente numa
// altura e sai atrás noutra; centrado na entrada, o buraco não cobriria a saída e o
// próximo tiro igual bateria no "fundo" do buraco. No meio, cobre o caminho todo.
export function holeCenter(pos, vel) {
  if (Math.abs(vel[2]) < 1e-3) return pos;
  const t = (TRENCH_Z - pos[2]) / vel[2];
  return [pos[0] + vel[0] * t, pos[1] + vel[1] * t, TRENCH_Z];
}

// Abre um buraco irregular ao redor do ponto (no plano do muro) e queima a borda.
// Devolve o raio sorteado e quantas células saíram.
export function carveHole(trench, pos, rand = Math.random) {
  const [cx, cy] = pos;
  const radius = HOLE_RADIUS_MIN + rand() * (HOLE_RADIUS_MAX - HOLE_RADIUS_MIN);
  const ph1 = rand() * Math.PI * 2, ph2 = rand() * Math.PI * 2;
  // raio efetivo varia com o ângulo: 2 ondas de frequência diferente
  const radiusAt = a => radius * (1 + HOLE_WOBBLE * (0.6 * Math.sin(3 * a + ph1) + 0.4 * Math.sin(5 * a + ph2)));
  const reach = radius * (1 + HOLE_WOBBLE) + BURN_WIDTH;
  const i0 = Math.max(0, Math.floor((cx - reach - LEFT) / CELL));
  const i1 = Math.min(COLS - 1, Math.floor((cx + reach - LEFT) / CELL));
  const j0 = Math.max(0, Math.floor((cy - reach) / CELL));
  const j1 = Math.min(ROWS - 1, Math.floor((cy + reach) / CELL));
  let removed = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * COLS + i;
      if (!trench.alive[k]) continue;
      const dx = LEFT + (i + 0.5) * CELL - cx, dy = (j + 0.5) * CELL - cy;
      const d = Math.hypot(dx, dy);
      const r = radiusAt(Math.atan2(dy, dx));
      const remove = d <= r * HOLE_CORE || (d <= r && rand() < EDGE_REMOVE_CHANCE);
      if (remove) {
        trench.alive[k] = 0;
        trench.aliveCount--;
        removed++;
      } else if (d <= r + BURN_WIDTH) {
        // sobrou perto da borda: queimada, mais forte quanto mais perto
        const b = Math.min(1, 1 - (d - r) / BURN_WIDTH);
        trench.burn[k] = Math.max(trench.burn[k], b * (0.75 + 0.25 * rand()));
      }
    }
  }
  return { radius, removed };
}

// Entulho estático ao pé do buraco: pedaços menores que as células de um bloco,
// no chão dos dois lados do muro (mais do lado para onde o tiro ia).
export function rubbleForHole(center, radius, shotVel, rand = Math.random) {
  const n = RUBBLE_PER_HOLE_MIN + Math.floor(rand() * (RUBBLE_PER_HOLE_MAX - RUBBLE_PER_HOLE_MIN + 1));
  const behind = shotVel[2] < 0 ? -1 : 1; // lado de trás do muro, na direção do tiro
  const pieces = [];
  for (let k = 0; k < n; k++) {
    const size = 0.07 + rand() * 0.09;
    const side = rand() < 0.6 ? behind : -behind;
    pieces.push({
      pos: [
        center[0] + (rand() - 0.5) * radius * 1.8,
        0,
        TRENCH_Z + side * (TRENCH_DEPTH / 2 + 0.05 + rand() * 0.6),
      ],
      size,
      yaw: rand() * Math.PI,
    });
  }
  return pieces;
}

// Malha do muro em coordenadas de mundo. Faces laterais (±X, ±Y) entre duas
// células vivas ficam escondidas e são puladas; as de frente/trás sempre entram.
const FACES = boxFaces(CELL / 2, CELL / 2, TRENCH_DEPTH / 2);
const NEIGHBOR = [null, null, [1, 0], [-1, 0], [0, 1], [0, -1]]; // mesma ordem de boxFaces
export function buildTrenchMesh(trench) {
  const verts = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if (!isAlive(trench, i, j)) continue;
      const center = [LEFT + (i + 0.5) * CELL, (j + 0.5) * CELL, TRENCH_Z];
      const base = COLORS[Math.floor(i / BAND_COLS) % 2];
      const b = trench.burn[j * COLS + i] * 0.9;
      const color = b > 0 ? base.map((c, k) => c + (BURN_COLOR[k] - c) * b) : base;
      FACES.forEach((f, fi) => {
        const nb = NEIGHBOR[fi];
        if (nb && isAlive(trench, i + nb[0], j + nb[1])) return;
        pushQuad(verts, f.c[0], f.c[1], f.c[2], f.c[3], f.n, color, center);
      });
    }
  }
  return new Float32Array(verts);
}
