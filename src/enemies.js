// ---------- Inimigos: torres que contra-atacam e tanques inimigos ----------
// Só lógica (mira balística, cadência, vida); o desenho fica em main.js.
// Os tiros inimigos usam a mesma gravidade dos tiros do jogador.
import { GRAVITY } from "./physics.js";

export const ENEMY_SHOT_SPEED = 15;

// Velocidade inicial para acertar `target` saindo de `from` com rapidez v
// (trajetória baixa). Sem solução (longe demais): 45°, alcance máximo.
export function ballisticVelocity(from, target, v = ENEMY_SHOT_SPEED) {
  const dx = target[0] - from[0], dz = target[2] - from[2];
  const d = Math.hypot(dx, dz) || 1e-3;
  const y = target[1] - from[1];
  const g = -GRAVITY;
  const disc = v ** 4 - g * (g * d * d + 2 * y * v * v);
  const ang = disc >= 0 ? Math.atan((v * v - Math.sqrt(disc)) / (g * d)) : Math.PI / 4;
  const h = Math.cos(ang) * v;
  return [dx / d * h, Math.sin(ang) * v, dz / d * h];
}

// Mira num alvo (o tanque do jogador). Com `lead`, prevê a posição futura
// pela velocidade do tanque (duas iterações do tempo de voo); `spread` é o
// erro aleatório em unidades de mundo.
export function aimAt(from, tankPos, tankVel, { lead = false, spread = 0, rand = Math.random } = {}) {
  let target = [tankPos[0], 0.6, tankPos[2]];
  if (lead) {
    for (let i = 0; i < 2; i++) {
      const t = Math.hypot(target[0] - from[0], target[2] - from[2]) / (ENEMY_SHOT_SPEED * 0.85);
      target = [tankPos[0] + tankVel[0] * t, 0.6, tankPos[2] + tankVel[2] * t];
    }
  }
  target[0] += (rand() - 0.5) * 2 * spread;
  target[2] += (rand() - 0.5) * 2 * spread;
  return ballisticVelocity(from, target);
}

// Tanques inimigos (parados): posição, direção (vira para o jogador), vida e
// recarga. Um acerto destrói.
export function createEnemyTanks(list) {
  return list.map(([x, z], i) => ({ x, z, yaw: 0, alive: true, cooldown: 1.5 + i * 0.8 }));
}

// O projétil do jogador acertou algum tanque inimigo vivo? (devolve o tanque)
export function enemyTankHit(enemies, pos) {
  return enemies.find(e => e.alive && pos[1] < 1.7 && Math.hypot(pos[0] - e.x, pos[2] - e.z) < 1.25) || null;
}

// O tiro inimigo acertou o tanque do jogador?
export function shotHitsPlayer(pos, tankPos) {
  return pos[1] < 1.8 && Math.hypot(pos[0] - tankPos[0], pos[2] - tankPos[2]) < 1.15;
}
