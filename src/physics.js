// ---------- Física: movimento do tanque e projéteis ----------
import { transformPoint, transformDirection } from "./math.js";
import { BARREL_LENGTH, tankModelMatrices } from "./tank.js";

export const MOVE_SPEED = 2.4;
export const GRAVITY = -9.8;
export const SHOT_SPEED = 11;

// Vetores "frente" e "direita" no plano XZ a partir do yaw da mira.
export function aimBasis(aimYaw) {
  return {
    forward: [Math.sin(aimYaw), 0, -Math.cos(aimYaw)],
    right: [Math.cos(aimYaw), 0, Math.sin(aimYaw)],
  };
}

// WASD relativo à direção do canhão, com velocidade normalizada na diagonal.
export function moveTank(state, keys, forward, right, dt) {
  let mx = 0, mz = 0;
  if (keys.has("w")) { mx += forward[0]; mz += forward[2]; }
  if (keys.has("s")) { mx -= forward[0]; mz -= forward[2]; }
  if (keys.has("d")) { mx += right[0]; mz += right[2]; }
  if (keys.has("a")) { mx -= right[0]; mz -= right[2]; }
  const mlen = Math.hypot(mx, mz);
  if (mlen > 0.0001) {
    state.x += (mx/mlen) * MOVE_SPEED * dt;
    state.z += (mz/mlen) * MOVE_SPEED * dt;
  }
}

// Posição e velocidade iniciais do projétil, saindo da boca do cano.
export function spawnProjectile(state) {
  const { barrel } = tankModelMatrices(state);
  const muzzlePos = transformPoint(barrel, [0, 0, -BARREL_LENGTH]);
  const dir = transformDirection(barrel, [0, 0, -1]);
  return {
    pos: muzzlePos,
    vel: [dir[0]*SHOT_SPEED, dir[1]*SHOT_SPEED, dir[2]*SHOT_SPEED],
  };
}

// Um passo de integração: gravidade real, sem curva "desenhada" — ela emerge da simulação.
function stepProjectile(p, dt) {
  p.vel[1] += GRAVITY * dt;
  p.pos[0] += p.vel[0] * dt;
  p.pos[1] += p.vel[1] * dt;
  p.pos[2] += p.vel[2] * dt;
}

// Primeiro alvo vivo (AABB { pos, half, alive }) que contém o ponto, ou null.
function hitTarget(pos, targets) {
  for (const t of targets) {
    if (!t.alive) continue;
    const dx = pos[0]-t.pos[0], dy = pos[1]-t.pos[1], dz = pos[2]-t.pos[2];
    if (Math.abs(dx) < t.half[0] && Math.abs(dy) < t.half[1] && Math.abs(dz) < t.half[2]) return t;
  }
  return null;
}
const hitGround = pos => pos[1] <= 0.08;
const outOfBounds = pos => Math.abs(pos[0]) > 20 || Math.abs(pos[2]) > 20; // saiu da área jogável

// targets = lista de segmentos da trincheira; onHitTarget(p, alvo) decide o que fazer com o alvo.
export function updateProjectiles(projectiles, dt, targets, { onHitTarget, onHitGround }) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    stepProjectile(p, dt);

    const target = hitTarget(p.pos, targets);
    if (target) {
      onHitTarget(p, target);
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
export function predictTrajectory(state, targets) {
  const p = spawnProjectile(state);
  const points = [...p.pos];
  for (let i = 1; i < PREDICT_MAX_POINTS; i++) {
    stepProjectile(p, PREDICT_STEP);
    points.push(p.pos[0], p.pos[1], p.pos[2]);
    if (hitTarget(p.pos, targets) || hitGround(p.pos) || outOfBounds(p.pos)) break;
  }
  return points;
}
