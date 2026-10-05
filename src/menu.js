// ---------- Menu principal e telas (briefing, tutorial, créditos, scores, fim) ----------
// HTML por cima do canvas; o jogo continua renderizando atrás (no menu, a
// câmera dá voltas no castelo ao pôr do sol, com poeira no ar).
// Transições: tela preta (#fader) — fade out 1.5 s → troca → fade in 0.5 s.
import { MISSIONS, unlockedMission } from "./missions.js";
import { bestScore, clearScores, formatDate } from "./scores.js";

const $ = id => document.getElementById(id);
const BRIEF_WAIT = 3;   // segundos até "Começar missão" liberar
export const FADE_OUT_MS = 1500, FADE_IN_MS = 500;

export function createMenu({ onStart, onResume, onLeave, sound }) {
  const overlay = $("overlay");
  const fader = $("fader");
  const screens = ["scr-menu", "scr-brief", "scr-select", "scr-tutorial", "scr-credits", "scr-scores", "scr-end"];
  let current = "scr-menu";
  const show = id => { current = id; screens.forEach(s => $(s).classList.toggle("on", s === id)); };

  // ---------- transição com tela preta ----------
  let busy = false;
  function transition(fn, outMs = FADE_OUT_MS, inMs = FADE_IN_MS) {
    if (busy) return;
    busy = true;
    fader.classList.add("blocking");
    fader.style.transition = `opacity ${outMs}ms ease-in-out`;
    fader.style.opacity = "1";
    setTimeout(() => {
      try { fn(); } finally {
        fader.style.transition = `opacity ${inMs}ms ease-out`;
        fader.style.opacity = "0";
        setTimeout(() => { busy = false; fader.classList.remove("blocking"); }, inMs);
      }
    }, outMs);
  }

  // ---------- desbloqueio das missões ----------
  const lockText = i => `Desbloqueado após M${i}`;
  function refreshUnlocks() {
    const u = unlockedMission();
    [["btn-m2", "lock-m2", 2], ["btn-m3", "lock-m3", 3]].forEach(([b, l, n]) => {
      $(b).disabled = u < n;
      $(l).textContent = u < n ? lockText(n - 1) : "";
    });
    document.querySelectorAll("[data-mission]").forEach(b => {
      const i = +b.dataset.mission, best = bestScore(MISSIONS[i].id);
      b.disabled = u < i + 1;
      b.querySelector(".lock").textContent = u < i + 1 ? lockText(i) : best ? `Melhor: ${best.score} pts` : "";
    });
  }

  // ---------- briefing da missão ----------
  let briefIndex = 0, briefReady = false, briefTimer = null;
  function stopBriefTimer() { if (briefTimer) clearInterval(briefTimer); briefTimer = null; }
  // auto = true: vindo de "Próxima missão"; começa sozinho depois da espera
  function brief(i, auto = false) {
    const m = MISSIONS[i];
    briefIndex = i;
    briefReady = false;
    $("brief-title").textContent = `MISSÃO ${m.id}`;
    $("brief-diff").textContent = m.difficulty;
    $("brief-diff").className = `chip d${m.id}`;
    $("brief-objectives").innerHTML = m.objectives.map(o => `<li>${o}</li>`).join("");
    const go = $("btn-brief-go");
    go.disabled = true;
    show("scr-brief");
    overlay.classList.remove("hidden");
    sound?.playLoading();
    let left = BRIEF_WAIT;
    const tick = () => {
      $("brief-countdown").textContent = left > 0
        ? (auto ? `Começando em ${left}…` : `Carregando… ${left}`)
        : "Pronto! Clique em Começar missão ou aperte Espaço";
    };
    tick();
    stopBriefTimer();
    briefTimer = setInterval(() => {
      left--;
      tick();
      if (left <= 0) {
        stopBriefTimer();
        briefReady = true;
        go.disabled = false;
        if (auto) startBriefed();
      }
    }, 1000);
  }
  function startBriefed() {
    if (!briefReady || current !== "scr-brief" || busy) return;
    briefReady = false;
    onLeave?.();
    transition(() => onStart(briefIndex));
  }
  function backToMenu() {
    stopBriefTimer();
    refreshUnlocks();
    show("scr-menu");
  }

  // ---------- scores ----------
  function renderScores() {
    let total = 0, done = 0;
    $("scores-list").innerHTML = MISSIONS.map(m => {
      const b = bestScore(m.id);
      if (b) { total += b.score; done++; }
      return `<div class="m"><span><b>MISSÃO ${m.id}</b> (${m.difficulty})</span>
        <span>${b ? `Melhor: <b>${b.score} pts</b> — ${formatDate(b.date)}` : "—"}</span></div>`;
    }).join("");
    const status = done === MISSIONS.length ? "Conquistador! 🏆" : done > 0 ? "Em campanha" : "Nenhuma missão concluída";
    $("scores-total").innerHTML = `TOTAL: ${total} pts<div class="tiny" style="font-size:13px; letter-spacing:.05em; margin-top:4px">STATUS: ${status}</div>`;
  }

  // ---------- botões ----------
  $("btn-start").onclick = () => brief(0);
  $("btn-m2").onclick = () => brief(1);
  $("btn-m3").onclick = () => brief(2);
  $("btn-resume").onclick = () => onResume();
  $("btn-tutorial").onclick = () => show("scr-tutorial");
  $("btn-credits").onclick = () => show("scr-credits");
  $("btn-scores").onclick = () => { renderScores(); show("scr-scores"); };
  $("btn-scores-clear").onclick = () => {
    if (confirm("Apagar todas as melhores pontuações?")) { clearScores(); renderScores(); }
  };
  $("btn-exit").onclick = () => {
    window.close();
    // o navegador só deixa fechar abas abertas por script: se ainda estiver aqui, avisa
    setTimeout(() => { $("exit-msg").textContent = "O navegador não deixa a página fechar a aba sozinha — feche com Ctrl+W."; }, 300);
  };
  $("btn-brief-go").onclick = startBriefed;
  $("btn-brief-back").onclick = backToMenu;
  document.querySelectorAll("[data-mission]").forEach(b => { b.onclick = () => brief(+b.dataset.mission); });
  document.querySelectorAll("[data-back]").forEach(b => { b.onclick = backToMenu; });

  // Espaço começa a missão no briefing; Esc volta ao menu nas telas secundárias
  window.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("hidden")) return;
    if (e.key === " " && current === "scr-brief") { e.preventDefault(); startBriefed(); }
    else if (e.key === "Escape" && ["scr-brief", "scr-select", "scr-tutorial", "scr-credits", "scr-scores"].includes(current)) backToMenu();
  });

  return {
    // abre o menu principal; `canResume` mostra o botão "Continuar" (jogo pausado)
    open(canResume = false) {
      stopBriefTimer();
      refreshUnlocks();
      $("btn-resume").style.display = canResume ? "" : "none";
      $("exit-msg").textContent = "";
      show("scr-menu");
      overlay.classList.remove("hidden");
    },
    close() {
      stopBriefTimer();
      overlay.classList.add("hidden");   // desvanece (transition de opacidade)
    },
    isOpen() {
      return !overlay.classList.contains("hidden");
    },
    brief,
    selectMission() { refreshUnlocks(); show("scr-select"); overlay.classList.remove("hidden"); },
    transition,
    // tela de vitória/derrota: título, conteúdo (HTML) e botões [{label, primary, action}]
    end(title, win, statsHtml, buttons) {
      $("end-title").textContent = title;
      $("end-title").className = "big " + (win ? "win" : "lose");
      $("end-stats").innerHTML = statsHtml;
      const box = $("end-btns");
      box.innerHTML = "";
      for (const b of buttons) {
        const el = document.createElement("button");
        el.className = "btn" + (b.primary ? " primary" : "");
        el.textContent = b.label;
        el.onclick = b.action;
        box.appendChild(el);
      }
      show("scr-end");
      overlay.classList.remove("hidden");
    },
  };
}
