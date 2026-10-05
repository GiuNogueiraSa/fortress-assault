// ---------- Partículas 3D da explosão ----------
// ParticleEmitter: um POOL fixo de partículas reaproveitadas (nada é criado ou
// apagado durante o jogo). Cada explosão ativa 60 delas, com:
//   - velocidade aleatória de 5 a 15 u/s em todas as direções (meia esfera
//     para cima, para não nascerem já enterradas no chão);
//   - gravidade real (-9.8 u/s², o mesmo passo de física dos projéteis);
//   - rotação própria em torno de um eixo aleatório, 360–720°/s;
//   - vida de 3 a 5 s, com alpha caindo de 1 a 0 ao longo dela;
//   - forma: cubo irregular, esfera pequena ou octaedro deformado;
//   - cor: azul (pedaço do castelo), verde (com hera), vermelho/rosa (com flor).
// Só lógica + malhas; o desenho fica em main.js (pipeline com alpha-to-coverage).
import { stepProjectile } from "./physics.js";
import { buildRock, buildSphere, FLOATS_PER_VERTEX } from "./geometry.js";

export const PARTICLES_PER_EXPLOSION = 60;
const SPEED_MIN = 5, SPEED_MAX = 15;
const SPIN_MIN = 2 * Math.PI, SPIN_MAX = 4 * Math.PI;   // 360°–720° por segundo
const LIFE_MIN = 3, LIFE_MAX = 5;
const SIZE_MIN = 0.06, SIZE_MAX = 0.22;

// cores (o shader multiplica a cor base cinza 0.5 da malha por esta tinta)
const TINTS = [
  { tint: [0.30, 0.50, 1.00], weight: 0.55 },   // azul: pedra do castelo
  { tint: [0.10, 0.50, 0.16], weight: 0.30 },   // verde: hera
  { tint: [1.70, 0.10, 0.24], weight: 0.09 },   // vermelho: flor
  { tint: [1.84, 0.50, 0.90], weight: 0.06 },   // rosa: flor
];
function randomTint(rand) {
  let r = rand();
  const t = (TINTS.find(c => (r -= c.weight) < 0) || TINTS[0]).tint;
  const k = 0.75 + rand() * 0.45;
  return t.map(c => c * k);
}

// Octaedro deformado: 6 vértices empurrados para dentro/fora e eixos esticados
function buildOctahedron(color, rand) {
  const s = [0.6 + rand() * 0.6, 0.5 + rand() * 0.6, 0.6 + rand() * 0.6];
  const V = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]]
    .map(v => v.map((c, k) => c * 0.5 * s[k] * (0.7 + rand() * 0.5)));
  const F = [[0,2,4], [2,1,4], [1,3,4], [3,0,4], [2,0,5], [1,2,5], [3,1,5], [0,3,5]];
  const out = [];
  for (const [a, b, c] of F) {
    const A = V[a], B = V[b], C = V[c];
    const u = B.map((x, k) => x - A[k]), w = C.map((x, k) => x - A[k]);
    let n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
    const cen = [0, 1, 2].map(k => (A[k] + B[k] + C[k]) / 3);
    if (n[0]*cen[0] + n[1]*cen[1] + n[2]*cen[2] < 0) n = n.map(x => -x);
    const l = Math.hypot(...n) || 1;
    for (const P of [A, B, C]) out.push(...P, ...n.map(x => x / l), ...color);
  }
  return new Float32Array(out);
}

// Formas disponíveis (geradas uma vez; cada partícula sorteia uma)
export function buildParticleShapes(rand = Math.random) {
  const GREY = [0.5, 0.5, 0.5];
  const shapes = [];
  for (let i = 0; i < 6; i++) shapes.push(buildRock(GREY, rand, i % 2 === 1));          // cubos/lascas irregulares
  for (let i = 0; i < 3; i++) shapes.push(new Float32Array(buildSphere(0.5, [0, 0, 0], GREY, [1, 0.8 + rand() * 0.4, 1], 5, 8)));
  for (let i = 0; i < 6; i++) shapes.push(buildOctahedron(GREY, rand));                 // octaedros deformados
  return shapes;
}
export const PARTICLE_FLOATS_PER_VERTEX = FLOATS_PER_VERTEX;

export class ParticleEmitter {
  constructor(poolSize, shapeCount, rand = Math.random) {
    this.rand = rand;
    this.shapeCount = shapeCount;
    // pool: todas as partículas existem desde o início; "alive" diz quais estão em uso
    this.pool = Array.from({ length: poolSize }, (_, slot) => ({
      slot, alive: false, pos: [0, 0, 0], vel: [0, 0, 0], axis: [0, 1, 0], angle: 0, spin: 0,
      size: 0.1, age: 0, life: 1, tint: [1, 1, 1], shape: 0, resting: false, bounced: false,
    }));
    this.next = 0;
  }

  // Ativa `count` partículas no ponto `pos` (reaproveita as mais antigas se o pool encher)
  // tintFn opcional: cor de cada partícula (ex.: lascas de metal de um tanque);
  // speedScale < 1 deixa a rajada mais lenta (confete da vitória)
  emit(pos, count = PARTICLES_PER_EXPLOSION, tintFn = null, speedScale = 1) {
    const r = this.rand;
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      // direção aleatória na meia esfera de cima
      const th = r() * Math.PI * 2, cy = r();
      const sy = Math.sqrt(1 - cy * cy);
      const speed = (SPEED_MIN + r() * (SPEED_MAX - SPEED_MIN)) * speedScale;
      const ax = [r() - 0.5, r() - 0.5, r() - 0.5]; const al = Math.hypot(...ax) || 1;
      const k = r();
      Object.assign(p, {
        alive: true, resting: false, bounced: false,
        pos: [pos[0], Math.max(pos[1], 0.2), pos[2]],
        vel: [Math.cos(th) * sy * speed, cy * speed, Math.sin(th) * sy * speed],
        axis: ax.map(c => c / al), angle: r() * 6.28,
        spin: SPIN_MIN + r() * (SPIN_MAX - SPIN_MIN),
        size: SIZE_MIN + (SIZE_MAX - SIZE_MIN) * k * k,   // mais pequenas que grandes
        age: 0, life: LIFE_MIN + r() * (LIFE_MAX - LIFE_MIN),
        tint: tintFn ? tintFn() : randomTint(r), shape: Math.floor(r() * this.shapeCount),
      });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      if (p.resting) continue;
      stepProjectile(p, dt);
      p.angle += p.spin * dt;
      const floorY = p.size * 0.3;
      if (p.pos[1] <= floorY) {
        p.pos[1] = floorY;
        if (!p.bounced && p.vel[1] < -2) {
          // quica uma vez, perdendo energia, e depois para (rolando menos)
          p.vel = [p.vel[0] * 0.4, -p.vel[1] * 0.3, p.vel[2] * 0.4];
          p.spin *= 0.4;
          p.bounced = true;
        } else {
          p.resting = true;
        }
      }
    }
  }

  // alpha: 1 → 0 ao longo da vida (some aos poucos)
  static opacity(p) {
    return Math.max(0, 1 - p.age / p.life);
  }

  alive() {
    return this.pool.filter(p => p.alive);
  }

  clear() {
    for (const p of this.pool) p.alive = false;
  }
}
