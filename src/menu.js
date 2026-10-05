// ---------- Menu principal e telas (tutorial, créditos, fim de missão) ----------
// HTML por cima do canvas; o jogo continua renderizando atrás (no menu, a
// câmera dá voltas no castelo ao pôr do sol).
import { unlockedMission } from "./missions.js";

const $ = id => document.getElementById(id);

export function createMenu({ onStart, onResume }) {
  const overlay = $("overlay");
  const screens = ["scr-menu", "scr-tutorial", "scr-credits", "scr-end"];
  const show = id => screens.forEach(s => $(s).classList.toggle("on", s === id));

  function refreshUnlocks() {
    const u = unlockedMission();
    $("btn-m2").disabled = u < 2;
    $("btn-m3").disabled = u < 3;
    $("btn-m2").title = u < 2 ? "Complete a Missão 1 para desbloquear" : "";
    $("btn-m3").title = u < 3 ? "Complete a Missão 2 para desbloquear" : "";
  }

  $("btn-start").onclick = () => onStart(0);
  $("btn-m2").onclick = () => onStart(1);
  $("btn-m3").onclick = () => onStart(2);
  $("btn-resume").onclick = () => onResume();
  $("btn-tutorial").onclick = () => show("scr-tutorial");
  $("btn-credits").onclick = () => show("scr-credits");
  document.querySelectorAll("[data-back]").forEach(b => { b.onclick = () => show("scr-menu"); });

  return {
    // abre o menu principal; `canResume` mostra o botão "Continuar" (jogo pausado)
    open(canResume = false) {
      refreshUnlocks();
      $("btn-resume").style.display = canResume ? "" : "none";
      show("scr-menu");
      overlay.classList.remove("hidden");
    },
    close() {
      overlay.classList.add("hidden");   // desvanece (transition de opacidade)
    },
    isOpen() {
      return !overlay.classList.contains("hidden");
    },
    // tela de vitória/derrota: título, estatísticas e botões [{label, primary, action}]
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
