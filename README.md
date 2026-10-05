# Fortress Assault 🎮

Jogo 3D de tanque em WebGPU — projeto de Computação Gráfica, FECAP.

Desenvolvido com suporte de IAs generativas (Claude, Gemini, ChatGPT), com
comparação validada e documentação completa do processo.

Destrua a fortaleza a tiros de canhão em **3 missões** progressivas. Cada uma
desbloqueia a seguinte, e o progresso e os recordes ficam salvos no
navegador.

1. **Fortaleza simples (fácil):** munição ilimitada, sem contra-ataque.
2. **Fortaleza maior (média):** as torres atiram de volta, 75 tiros, o tanque
   aguenta 5 impactos.
3. **Fortaleza épica (difícil):** torres que preveem o movimento, 3 tanques
   inimigos, 100 tiros e 3 minutos.

## 🚀 Como rodar

**Online:** <https://giunogueirasa.github.io/fortress-assault/> (GitHub Pages; precisa de Chrome ou Edge com WebGPU).

**Local:**

O código usa módulos ES, então é preciso um servidor HTTP local (abrir o
`index.html` direto pelo arquivo não funciona). Na pasta do projeto:

```bash
python serve.py
# Abra http://localhost:8000
```

`serve.py` é o servidor de arquivos do Python com o cache desligado. O
`python -m http.server 8000` também funciona, mas o navegador pode continuar
usando versões antigas dos `.js` depois que o código muda.

Use um **Chrome ou Edge atualizado** (com WebGPU). Se o WebGPU estiver
desativado, ative em `chrome://flags/#enable-unsafe-webgpu`.

## 📊 Documentação

- **[ai-log.md](docs/ai-log.md):** 32 entradas cronológicas de uso de IA
  (prompt, o que foi feito, arquivos, problemas e correções).
- **[DEVELOPMENT_REPORT.md](docs/DEVELOPMENT_REPORT.md):** relatório técnico
  completo.
- **[analise-ias.md](docs/analise-ias.md):** comparação validada entre
  Claude, Gemini e ChatGPT (código compilado e comparado pixel a pixel).

## 🎬 Apresentação

[Slides interativos](src/presentation.html). Com o servidor rodando, abra
<http://localhost:8000/src/presentation.html>. Navegue com ← / → ou clicando
no slide, e use Ctrl+P para gerar o PDF.

## ✨ Recursos

- 3 missões progressivas (fácil → difícil), com briefing, ranking por
  missão e melhores pontuações.
- Explosões 3D: fogo turbulento (shader adaptado do Shadertoy, com cores
  realistas), onda de choque e 60 partículas com gravidade e rotação.
- Iluminação dinâmica: uma luz pontual por explosão, sombras do sol (shadow
  map) e iluminação por pixel.
- Castelo destrutível em qualquer ponto, com buracos recortados no shader; dá
  para atravessá-lo.
  - **Buracos que crescem:** acertar a borda de um buraco o aumenta, e 3–4
    tiros no mesmo ponto abrem uma brecha grande.
  - **Torres que desmoronam:** quando um setor zera, o topo da torre desaba,
    com explosões e pedaços caindo que viram entulho.
  - **Crateras no chão:** cada tiro que erra deixa uma marca de fuligem com
    terra revirada.
- Som sintetizado com Tone.js:
  - explosão, tiro, impacto e alerta de tempo;
  - vitória, derrota e seleção;
  - música ambiente.
- Menu animado com transições e confete na vitória.

## 🎯 Critérios de avaliação

| Critério | Pts | Evidência | Status |
|----------|-----|-----------|--------|
| Registro de uso de IAs | 2,5 | [docs/ai-log.md](docs/ai-log.md) | ✅ |
| Erros e correções | 2,5 | seções "Problemas" do ai-log + mensagens de commit | ✅ |
| Comparação entre IAs | 2,0 | [docs/analise-ias.md](docs/analise-ias.md) | ✅ |
| Origem do shader e adaptações | 1,0 | cabeçalho de `src/explosion.js` + Créditos | ✅ |
| App funcional | 1,5 | demonstração ao vivo | ✅ |
| Clareza da apresentação | 0,5 | slides + documentação | ✅ |
| **Total** | **10,0** | | |

## 📈 Desempenho (medido)

Medido no Chrome, com janela de 1000×700:
- **Menu:** ~58 fps.
- **Missão 3 em combate**, o caso mais pesado:
  - 41–54 fps na máquina de desenvolvimento em condições normais;
  - 30–35 fps nos momentos em que a máquina inteira estava mais lenta.

O ponto mais caro é o shader da explosão perto da câmera. Detalhes no
[relatório](docs/DEVELOPMENT_REPORT.md#9-desempenho).

## 🎮 Controles

| Ação | Tecla |
|---|---|
| Andar para frente / ré (com inércia) | W / S |
| Girar o corpo (a torre continua mirando) | A / D |
| Mirar: girar a torre e subir/descer o cano | Mouse (clique no jogo para travar) |
| Girar a torre / ajuste fino do cano (sem mouse) | Q / E · ↑ / ↓ |
| Atirar (a linha mostra a trajetória) | Espaço |
| Menu / pausa | M (ou Esc com o mouse solto) |
| Liga/desliga a música | N |
| Soltar o mouse | Esc |

## 🛠️ Arquitetura

19 módulos JavaScript, em WebGPU puro (sem engine nem three.js), com os
shaders WGSL escritos no projeto.

```
index.html        página, HUD, menu e estilos
serve.py          servidor local sem cache
src/main.js       WebGPU, pipelines, fluxo menu → missões, entrada e loop do jogo
src/lighting.js   iluminação, sombras (shadow map), luzes pontuais, castelo procedural e buracos
src/explosion.js  shader de explosão (externo, adaptado para WGSL) e onda de choque
src/explosion-particles.js  ParticleEmitter (pool) das partículas 3D
src/explosion-sound.js      sons e música com Tone.js
src/missions.js   configuração das 3 missões e progresso salvo
src/scores.js     pontuação, ranking e melhores pontuações (localStorage)
src/menu.js       menu, briefing, seleção, scores, transições, vitória/derrota
src/hud.js        HUD: setores, vida, munição, tempo, avisos, minimapa
src/enemies.js    mira balística das torres e tanques inimigos
src/trench.js     castelo: torres, muralhas, portão, pátio, buracos e colisões
src/physics.js    movimento do tanque, disparo, física e previsão da trajetória
src/tank.js       tanque (modelo 3D ou caixas) e hierarquia chassi → torre → cano
src/gltf.js       loader mínimo de .glb
src/geometry.js   primitivas (caixa, cilindro, pedra irregular), chão e projétil
src/math.js       matrizes 4x4
src/aimLine.js    linha de mira
src/sky.js        céu com sol e nuvens
src/scenery.js    árvores
src/presentation.html  slides da apresentação
assets/models/    modelo 3D do tanque (tank.glb)
assets/vendor/    Tone.js 14.8.49 (MIT), cópia local
docs/             ai-log, relatório técnico, análise das IAs
```

Plano B: em `src/main.js`, `const USE_MODEL_3D = false` volta para o tanque
feito de caixas. Se o `.glb` não carregar, o jogo usa as caixas sozinho e
avisa no HUD.

## 👨‍🏫 Professor

Adriano Felix Valente

## 👥 Grupo

[Nomes do grupo]

## 📝 Tecnologias

- WebGPU (renderização)
- WGSL (shaders)
- Tone.js 14.8.49 (síntese de som)
- JavaScript (módulos ES)
- Git (controle de versão)

## 📜 Créditos e licenças

- **Efeito de explosão:** adaptado para WGSL a partir de
  ["Cartoon explosion"](https://www.shadertoy.com/view/X3dGz2) (Shadertoy),
  usando como base a versão para Godot publicada em
  [godotshaders.com](https://godotshaders.com/shader/cartoon-explosion-effect/).
  Licença [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/);
  a adaptação em `src/explosion.js` é distribuída sob a mesma licença.
- **Modelo 3D do tanque:** ["Tank"](https://sketchfab.com/3d-models/tank-9d28a36e12c24f94b852610677706552),
  de [Willy Decarpentrie](https://sketchfab.com/skudgee), licença
  [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).
  - Alterações: as cores do material são substituídas por código (a textura
    original não é usada), a escala e a orientação foram ajustadas, e o cano
    foi separado do resto para girar com a mira.
- **Som:** [Tone.js](https://tonejs.github.io/) v14.8.49, licença MIT. Todos
  os sons são sintetizados, sem arquivos de áudio.

## 🔗 Links

- **GitHub:** https://github.com/GiuNogueiraSa/fortress-assault
- **FECAP:** https://www.fecap.br/
- **Shader original:** [Shadertoy X3dGz2](https://www.shadertoy.com/view/X3dGz2) (CC BY-NC-SA 3.0)

---

Desenvolvido com Claude, Gemini e ChatGPT em outubro de 2026.
