// ---------- Física: movimento do tanque e projéteis ----------
import { transformPoint, transformDirection } from "./math.js";
import { barrelLength, tankModelMatrices } from "./tank.js";

export const MOVE_SPEED = 2.4;
export const TURN_SPEED = 1.5; // rad/s (~86°/s) ao segurar A/D
export const GRAVITY = -9.8;
export const SHOT_SPEED = 11;

// Vetor "frente" do corpo no plano XZ: igual ao eixo -Z local do chassi após
// mat4.rotationY(yaw), para câmera, movimento e cano apontarem para o mesmo lado.
export function bodyForward(yaw) {
  return [-Math.sin(yaw), 0, -Math.cos(yaw)];
}

// Controle clássico de tanque: A/D giram o corpo no próprio eixo, W/S andam
// para frente/ré na direção do corpo. Os dois são aplicados no mesmo quadro,
// independentes, então W+D (etc.) vira uma curva sem lógica especial.
// blocked(x, z): opcional, diz se o tanque bateria em algo na posição (fortaleza).
// Se o movimento completo bate, tenta cada eixo separado (desliza na parede).
export function moveTank(state, keys, dt, blocked = null) {
  let turn = 0, drive = 0;
  if (keys.has("a")) turn += 1;   // yaw positivo gira para a esquerda
  if (keys.has("d")) turn -= 1;
  if (keys.has("w")) drive += 1;
  if (keys.has("s")) drive -= 1;
  state.yaw += turn * TURN_SPEED * dt;
  const forward = bodyForward(state.yaw);
  const nx = state.x + forward[0] * drive * MOVE_SPEED * dt;
  const nz = state.z + forward[2] * drive * MOVE_SPEED * dt;
  // se já está encostado/dentro de algo (ex.: castelo reconstruído em cima), deixa sair
  if (!blocked || blocked(state.x, state.z) || !blocked(nx, nz)) { state.x = nx; state.z = nz; }
  else if (!blocked(nx, state.z)) state.x = nx;
  else if (!blocked(state.x, nz)) state.z = nz;
}

// Posição e velocidade iniciais do projétil, saindo da boca do cano.
export function spawnProjectile(state) {
  const { barrel } = tankModelMatrices(state);
  const muzzlePos = transformPoint(barrel, [0, 0, -barrelLength()]);
  const dir = transformDirection(barrel, [0, 0, -1]);
  return {
    pos: muzzlePos,
    vel: [dir[0]*SHOT_SPEED, dir[1]*SHOT_SPEED, dir[2]*SHOT_SPEED],
  };
}

// Um passo de integração: gravidade real, sem curva "desenhada" — ela emerge da simulação.
// (exportado: os destroços da explosão usam o mesmo passo)
export function stepProjectile(p, dt) {
  p.vel[1] += GRAVITY * dt;
  p.pos[0] += p.vel[0] * dt;
  p.pos[1] += p.vel[1] * dt;
  p.pos[2] += p.vel[2] * dt;
}

const hitGround = pos => pos[1] <= 0.08;
const outOfBounds = pos => Math.abs(pos[0]) > 200 || Math.abs(pos[2]) > 200; // longe demais (o mundo vai até o horizonte)

// isSolid(pos) diz se o ponto está dentro do alvo (ex.: uma célula de pé da trincheira);
// onHitTarget(p) decide o que fazer com o impacto.
export function updateProjectiles(projectiles, dt, isSolid, { onHitTarget, onHitGround }) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    stepProjectile(p, dt);

    if (isSolid(p.pos)) {
      onHitTarget(p);
      projectiles.splice(i, 1);
    } else if (hitGround(p.pos)) {
      onHitGround(p);
      projectiles.splice(i, 1);
    } else if (outOfBounds(p.pos)) {
      projectiles.splice(i, 1);
    }
  }
}

// Linha de mira: simula um tiro "fantasma" com a MESMA velocidade inicial, gravidade
// e testes de parada do tiro real, sem disparar. Devolve os pontos [x,y,z, x,y,z, ...].
export const PREDICT_STEP = 1 / 60;
export const PREDICT_MAX_POINTS = 240; // 4 s de voo, bem mais que o tiro mais longo
export function predictTrajectory(state, isSolid) {
  const p = spawnProjectile(state);
  const points = [...p.pos];
  for (let i = 1; i < PREDICT_MAX_POINTS; i++) {
    stepProjectile(p, PREDICT_STEP);
    points.push(p.pos[0], p.pos[1], p.pos[2]);
    if (isSolid(p.pos) || hitGround(p.pos) || outOfBounds(p.pos)) break;
  }
  return points;
}
