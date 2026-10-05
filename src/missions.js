// ---------- Missões: configuração de cada fase e progresso salvo ----------
// Cada missão define o tamanho do castelo (escala), a resistência dos setores,
// o contra-ataque das torres, tanques inimigos, munição, vida e tempo.

export const MISSIONS = [
  {
    id: 1,
    title: "Missão 1/3: Destrua a fortaleza",
    castleScale: 1.0,          // castelo base: muralha 10, torres ~14
    ivyBoost: 0.0,
    sectorHits: 8,             // acertos para zerar cada torre/lado
    doorHP: 3,                 // acertos para derrubar o portão (setor do meio)
    towerFireInterval: 0,      // 0 = torres não atiram
    towerLead: false,
    enemyTanks: [],
    ammo: Infinity,
    tankHits: 5,               // impactos que o tanque aguenta
    timeLimit: 0,              // 0 = sem limite
    victoryText: "FORTALEZA CONQUISTADA!",
  },
  {
    id: 2,
    title: "Missão 2/3: Fortaleza com defesas",
    castleScale: 1.12,         // torres ~16
    ivyBoost: 0.08,            // mais folhagem/flores
    sectorHits: 10,
    doorHP: 5,                 // portão mais resistente
    towerFireInterval: 2.0,    // um tiro a cada 2 s (alternando as torres)
    towerLead: false,          // mira onde o tanque está (com erro)
    enemyTanks: [],
    ammo: 75,
    tankHits: 5,
    timeLimit: 0,
    victoryText: "MISSÃO COMPLETADA! Você conquistou a fortaleza!",
  },
  {
    id: 3,
    title: "Missão 3/3: Fortaleza épica",
    castleScale: 1.25,         // ~18 de altura, 25 de largura
    ivyBoost: 0.12,
    sectorHits: 12,
    doorHP: 6,
    towerFireInterval: 1.0,    // um tiro por segundo
    towerLead: true,           // prevê para onde o tanque vai
    // tanques inimigos parados na frente do castelo (x, z)
    enemyTanks: [[-7.5, -4.5], [0, -3.5], [7.5, -4.5]],
    enemyFireInterval: 2.5,
    ammo: 100,
    tankHits: 5,
    timeLimit: 180,
    victoryText: "VOCÊ É O CONQUISTADOR!",
  },
];

// ---------- Progresso (localStorage; o jogo funciona mesmo sem ele) ----------
const KEY = "fortress-assault-unlocked";
export function unlockedMission() {
  try {
    const v = parseInt(localStorage.getItem(KEY) || "1", 10);
    return Math.min(Math.max(v, 1), MISSIONS.length);
  } catch {
    return 1;
  }
}
export function unlockMission(n) {
  try {
    if (n > unlockedMission()) localStorage.setItem(KEY, String(Math.min(n, MISSIONS.length)));
  } catch { /* sem armazenamento (aba privada etc.): só não salva */ }
}
