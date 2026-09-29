// ---------- Trincheira inimiga destrutível (grade de células) ----------
// O muro é uma grade de células pequenas (CELL x CELL, atravessando a espessura
// toda). Cada impacto remove as células dentro de um círculo -> buraco redondo.
// A mesma grade serve para desenhar e para a colisão: o projétil passa pelo
// buraco exatamente onde ele aparece na tela.
import { boxFaces, pushQuad, FLOATS_PER_VERTEX } from "./geometry.js";

export const TRENCH_WIDTH = 7.2;   // mesma largura dos 9 blocos de 0.8 da versão anterior
export const TRENCH_HEIGHT = 3.5;
export const TRENCH_DEPTH = 0.6;
export const TRENCH_Z = -6;        // onde ficava o alvo original
const CELL = 0.1;
// Diâmetro do buraco = largura de dois blocos da versão anterior (2 x 0.8)
export const HOLE_RADIUS = 0.8;
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
  return { alive: new Uint8Array(COLS * ROWS).fill(1), aliveCount: COLS * ROWS };
}

export function resetTrench(trench) {
  trench.alive.fill(1);
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

// Remove as células cujo centro está a até HOLE_RADIUS do ponto (no plano do muro).
export function carveHole(trench, pos) {
  const [cx, cy] = pos;
  const i0 = Math.max(0, Math.floor((cx - HOLE_RADIUS - LEFT) / CELL));
  const i1 = Math.min(COLS - 1, Math.floor((cx + HOLE_RADIUS - LEFT) / CELL));
  const j0 = Math.max(0, Math.floor((cy - HOLE_RADIUS) / CELL));
  const j1 = Math.min(ROWS - 1, Math.floor((cy + HOLE_RADIUS) / CELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = LEFT + (i + 0.5) * CELL, y = (j + 0.5) * CELL;
      const k = j * COLS + i;
      if (trench.alive[k] && Math.hypot(x - cx, y - cy) <= HOLE_RADIUS) {
        trench.alive[k] = 0;
        trench.aliveCount--;
      }
    }
  }
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
      const color = COLORS[Math.floor(i / BAND_COLS) % 2];
      FACES.forEach((f, fi) => {
        const nb = NEIGHBOR[fi];
        if (nb && isAlive(trench, i + nb[0], j + nb[1])) return;
        pushQuad(verts, f.c[0], f.c[1], f.c[2], f.c[3], f.n, color, center);
      });
    }
  }
  return new Float32Array(verts);
}
