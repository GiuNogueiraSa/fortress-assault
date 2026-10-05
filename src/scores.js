// ---------- Pontuação e ranking por missão ----------
// Três notas de 0 a 1000 cada (total máximo 3000):
//   - Velocidade: 1000 se terminar em até metade do tempo de referência,
//     cai linearmente até 0 em 2x o tempo de referência;
//   - Munição: tiros mínimos necessários / tiros disparados;
//   - Integridade: saúde restante do tanque.
// Melhor pontuação de cada missão fica no localStorage
// (mission_N_best_score); sem armazenamento, o jogo só não salva.
import { MISSIONS } from "./missions.js";

export const MAX_SCORE = 3000;
const clamp01 = v => Math.max(0, Math.min(1, v));

// tiros mínimos para vencer: cada torre/lado, o portão e cada tanque inimigo
export const minShots = m => 2 * m.sectorHits + m.doorHP + m.enemyTanks.length;

export function computeScore(m, { time, shots, hp }) {
  const par = m.parTime;
  const speed = Math.round(1000 * clamp01((2 * par - time) / (1.5 * par)));
  const ammo = Math.round(1000 * clamp01(minShots(m) / Math.max(1, shots)));
  const integrity = Math.round(1000 * clamp01(hp));
  const total = speed + ammo + integrity;
  return { speed, ammo, integrity, total, pct: Math.round(100 * total / MAX_SCORE) };
}

export function rankFor(pct) {
  if (pct >= 90) return { label: "EXCELENTE", stars: "⭐⭐⭐" };
  if (pct >= 75) return { label: "ÓTIMO", stars: "⭐⭐" };
  if (pct >= 55) return { label: "BOM", stars: "⭐" };
  return { label: "REGULAR", stars: "" };
}

const key = id => `mission_${id}_best_score`;

// {score, date} ou null
export function bestScore(id) {
  try {
    const v = JSON.parse(localStorage.getItem(key(id)) || "null");
    return v && typeof v.score === "number" ? v : null;
  } catch {
    return null;
  }
}

// salva se for recorde; devolve true quando é um novo recorde
export function saveScore(id, score) {
  const best = bestScore(id);
  if (best && best.score >= score) return false;
  try {
    localStorage.setItem(key(id), JSON.stringify({ score, date: new Date().toISOString() }));
  } catch { /* sem armazenamento */ }
  return true;
}

export function clearScores() {
  for (const m of MISSIONS) {
    try { localStorage.removeItem(key(m.id)); } catch { /* sem armazenamento */ }
  }
}

export function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
