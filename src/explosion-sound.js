// ---------- Som do jogo (Tone.js, só síntese, sem arquivos de áudio) ----------
// Tone.js (MIT) vem de uma cópia local em assets/vendor/Tone.js, carregada no
// index.html por <script> (o arquivo é UMD e define window.Tone; não é módulo
// ES). Local para funcionar sem internet na apresentação.
// Os instrumentos são criados UMA vez e reaproveitados: criar um sintetizador
// novo a cada tiro/explosão acumularia milhares de nós de áudio numa partida.
// O navegador só libera áudio depois de um clique/tecla: init() é chamado no
// primeiro botão do menu. Sem Tone (ou se falhar), tudo vira silêncio.

export class ExplosionSound {
  constructor() {
    this.initialized = false;
    this.musicOn = false;
  }

  get available() {
    return typeof window !== "undefined" && !!window.Tone;
  }

  async init() {
    if (this.initialized || !this.available) return;
    const Tone = window.Tone;
    try {
      await Tone.start();
      const master = new Tone.Volume(-6).toDestination();
      this.master = master;

      // explosão: ruído marrom com envelope, passando por passa-baixa, + "boom"
      // com pitch descendente (MembraneSynth = seno que cai de frequência)
      this.boomFilter = new Tone.Filter({ frequency: 1000, type: "lowpass" }).connect(master);
      this.boomNoise = new Tone.NoiseSynth({
        noise: { type: "brown" },
        envelope: { attack: 0.05, decay: 0.8, sustain: 0, release: 0.1 },
        volume: 2,
      }).connect(this.boomFilter);
      this.boomTone = new Tone.MembraneSynth({
        pitchDecay: 0.25, octaves: 4,
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 0.6, sustain: 0, release: 0.1 },
        volume: -2,
      }).connect(master);

      // tiro do tanque ("piu"): dente-de-serra curto
      this.fireSynth = new Tone.Synth({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
        volume: -14,
      }).connect(master);

      // impacto no tanque: batida seca e grave
      this.impactSynth = new Tone.MembraneSynth({
        pitchDecay: 0.03, octaves: 2,
        envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.05 },
        volume: -4,
      }).connect(master);

      // alerta de tempo: bip quadrado agudo
      this.warnSynth = new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 },
        volume: -16,
      }).connect(master);

      // música ambiente: acordes suaves em triângulo (C – G – Am – Em), volume baixo
      this.music = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.8, decay: 1, sustain: 0.5, release: 1.5 },
        volume: -24,
      }).connect(master);
      const chords = [["C3", "E3", "G3"], ["G2", "B2", "D3"], ["A2", "C3", "E3"], ["E2", "G2", "B2"]];
      let i = 0;
      this.loop = new Tone.Loop((time) => {
        this.music.triggerAttackRelease(chords[i % chords.length], "1n", time);
        i++;
      }, "1n");
      Tone.Transport.bpm.value = 60;
      this.initialized = true;
    } catch (err) {
      console.warn("Som indisponível:", err);
    }
  }

  // várias explosões no mesmo instante: toca uma vez (evita estourar o volume)
  playExplosion(strength = 1) {
    if (!this.initialized) return;
    const now = window.Tone.now();
    if (this.lastBoom && now - this.lastBoom < 0.06) return;
    this.lastBoom = now;
    const v = Math.max(0.15, Math.min(1, strength));
    this.boomNoise.triggerAttackRelease(0.8, now, v);
    this.boomTone.triggerAttackRelease("G2", 0.6, now, v);
  }

  playFire() {
    if (!this.initialized) return;
    this.fireSynth.triggerAttackRelease("D5", 0.15);
  }

  playImpact() {
    if (!this.initialized) return;
    this.impactSynth.triggerAttackRelease("A2", 0.1);
  }

  playTimeWarning() {
    if (!this.initialized) return;
    const now = window.Tone.now();
    this.warnSynth.triggerAttackRelease("C6", 0.1, now);
    this.warnSynth.triggerAttackRelease("C6", 0.1, now + 0.2);
  }

  startAmbientMusic() {
    if (!this.initialized || this.musicOn) return;
    this.loop.start(0);
    window.Tone.Transport.start();
    this.musicOn = true;
  }

  stopAmbientMusic() {
    if (!this.initialized || !this.musicOn) return;
    this.loop.stop();
    window.Tone.Transport.stop();
    this.musicOn = false;
  }

  toggleMusic() {
    if (this.musicOn) this.stopAmbientMusic(); else this.startAmbientMusic();
    return this.musicOn;
  }
}
