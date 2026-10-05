// ---------- HUD do jogo (HTML por cima do canvas) ----------
// Barras dos 3 setores do castelo, vida do tanque, munição, tempo, inimigos,
// avisos rápidos e um minimapa 2D (visto de cima).
const $ = id => document.getElementById(id);

export function showHud(on) {
  $("game-hud").classList.toggle("on", on);
}

export function setMissionTitle(text) {
  $("mission-title").textContent = text;
}

function bar(name, frac) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  $("bar-" + name).style.width = pct + "%";
  $("pct-" + name).textContent = pct + "%";
}

export function setSectors(left, gate, right) {
  bar("left", left); bar("gate", gate); bar("right", right);
}

export function setHP(frac, visible) {
  $("hp-panel").style.display = visible ? "" : "none";
  bar("hp", frac);
}

export function setAmmo(left, max) {
  $("ammo").textContent = max === Infinity ? "Munição: ∞" : `Munição: ${left}/${max}`;
}

export function setTimer(seconds) {
  const el = $("timer");
  if (seconds === null) { el.textContent = ""; return; }
  el.textContent = `Tempo: ${Math.ceil(Math.max(0, seconds))}s`;
  el.classList.toggle("low", seconds < 30);
}

export function setEnemiesLeft(n) {
  $("enemies-left").textContent = n === null ? "" : `Tanques inimigos: ${n}`;
}

let toastTimer = 0;
export function toast(text, seconds = 1.6) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("on");
  toastTimer = seconds;
}
export function updateToast(dt) {
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $("toast").classList.remove("on");
  }
}

// Minimapa: castelo (retângulo), tanque do jogador (seta amarela), tanques
// inimigos (vermelho), visto de cima. Escala fixa centrada no castelo.
export function drawMinimap({ tank, enemies, castle }) {
  const cv = $("minimap");
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const span = 60;                               // metros mostrados
  const cx = 0, cz = castle.centerZ + 8;         // centro do mapa
  const px = x => (x - cx) / span * W + W / 2;
  const pz = z => (z - cz) / span * H + H / 2;
  // castelo
  g.fillStyle = "rgba(60,100,200,0.85)";
  g.fillRect(px(castle.xMin), pz(castle.zMin), (castle.xMax - castle.xMin) / span * W, (castle.zMax - castle.zMin) / span * H);
  // inimigos
  g.fillStyle = "#ff4b3e";
  for (const e of enemies) if (e.alive) { g.beginPath(); g.arc(px(e.x), pz(e.z), 6, 0, 6.283); g.fill(); }
  // tanque (triângulo apontando para a frente do corpo)
  const x = px(tank.x), z = pz(tank.z), a = tank.yaw;
  const fx = -Math.sin(a), fz = -Math.cos(a);
  g.fillStyle = "#ffd34d";
  g.beginPath();
  g.moveTo(x + fx * 11, z + fz * 11);
  g.lineTo(x - fx * 7 - fz * 7, z - fz * 7 + fx * 7);
  g.lineTo(x - fx * 7 + fz * 7, z - fz * 7 - fx * 7);
  g.closePath(); g.fill();
}
