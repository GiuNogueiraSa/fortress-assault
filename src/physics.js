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

// Física dos projéteis: gravidade real, sem curva "desenhada" — ela emerge da simulação.
// target = { pos, half } é lido a cada projétil (onHitTarget pode reposicionar o alvo).
export function updateProjectiles(projectiles, dt, target, { onHitTarget, onHitGround }) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.vel[1] += GRAVITY * dt;
    p.pos[0] += p.vel[0] * dt;
    p.pos[1] += p.vel[1] * dt;
    p.pos[2] += p.vel[2] * dt;

    const dx = p.pos[0]-target.pos[0], dy = p.pos[1]-target.pos[1], dz = p.pos[2]-target.pos[2];
    const hitTarget = Math.abs(dx) < target.half[0] && Math.abs(dy) < target.half[1] && Math.abs(dz) < target.half[2];

    if (hitTarget) {
      onHitTarget(p);
      projectiles.splice(i, 1);
    } else if (p.pos[1] <= 0.08) {
      onHitGround(p);
      projectiles.splice(i, 1);
    } else if (Math.abs(p.pos[0]) > 20 || Math.abs(p.pos[2]) > 20) {
      projectiles.splice(i, 1); // saiu da área jogável
    }
  }
}
