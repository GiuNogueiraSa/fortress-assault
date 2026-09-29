# Registro de uso de IA (Claude Code)

Registro cronológico dos prompts enviados ao Claude Code neste projeto e do
que foi feito em resposta. Entrada mais recente no final.

As entradas 1 a 8 são **retroativas**: foram reconstruídas em 28/09/2026 a
partir da conversa e do histórico do git, porque a regra de registro só foi
criada no prompt 9. Os horários delas são os dos commits correspondentes.
Os commits citados têm mensagens detalhadas (`git log`).

---

## 1. Organizar o protótipo como projeto — 28/09/2026 19:25–19:27 (retroativa)

**Prompt:** criar CLAUDE.md com os requisitos do trabalho, separar o JS do HTML
em módulos (math, geometry, tank, physics, main) sem mudar comportamento,
iniciar git, criar README e testar localmente.

**Feito:**
- Commit do protótipo original intacto (referência), depois refatoração em
  `src/*.js` com `index.html` só com HTML/CSS.
- `tankModelMatrices()` juntou o cálculo chassi → torre → cano que estava
  duplicado em `fire()` e `frame()`.
- CLAUDE.md, README.md e .gitignore.

**Arquivos:** `index.html` (renomeado de `webgpu-tank-prototype.html`),
`src/math.js`, `src/geometry.js`, `src/tank.js`, `src/physics.js`,
`src/main.js`, `CLAUDE.md`, `README.md`, `.gitignore`.

**Problemas:**
- O arquivo se chamava `webgpu-tank-prototype.html`, não `index.html` → foi
  usado como fonte e renomeado.
- Chrome headless não inicializou o WebGPU → teste feito com Playwright
  dirigindo o Chrome com janela e GPU real.
- Para provar "comportamento idêntico": relógio virtual e `Math.random` fixos,
  mesma sequência de teclas no original e no refatorado → 4 capturas
  idênticas pixel a pixel.
- Módulos ES não carregam via `file://` → documentado no README o uso de
  `python -m http.server`.

**Commits:** `696a5ca`, `457ed5c`

## 2. Como ver o jogo rodando — 28/09/2026 (retroativa)

**Prompt:** "como eu vejo ele rodando?"

**Feito:** servidor local iniciado (`python -m http.server 8000`) e jogo aberto
no Chrome; explicado como repetir sozinho.

**Arquivos:** nenhum.

## 3. Portar o shader de explosão para WGSL — 28/09/2026 19:40 (retroativa)

**Prompt:** converter para WGSL o shader "Cartoon explosion" (Shadertoy
X3dGz2, versão Godot, CC BY-NC-SA 3.0), explicar as diferenças GLSL → WGSL e
como passar tempo e posição como uniforms.

**Feito:**
- `src/explosion.js`: shader WGSL com quad billboard gerado no vertex shader,
  fonte e licença no cabeçalho, e o helper `explosionUniformData()`
  (uniform buffer de 112 bytes, respeitando o alinhamento de `vec3f`).
- Adaptações: `mod` reimplementado (o `%` do WGSL trunca), uniforms com
  default viraram `const`, `clamp` no índice da paleta, `discard` no lugar
  de blending.

**Arquivos:** `src/explosion.js`.

**Problemas:**
- No original o índice da paleta podia sair do array (v em [0.75, 1) → índice
  4 num array de 4) → limitado com `clamp`.
- Divisão por zero em t = 0 → `repeat` limitado a ≥ 0.001.
- Validação: página de teste com o GLSL original (WebGL2) ao lado do WGSL
  (WebGPU) → diferença ≤ 0.03% dos pixels. O teste também mostrou que o
  efeito some em ~1.3 s (e não em 2 s) → `EXPLOSION_DURATION = 1.3`.

**Commit:** `add3017`

## 4. Ligar a explosão ao jogo — 28/09/2026 19:42 (retroativa)

**Prompt:** "Sim" (ligar a explosão ao acerto no alvo).

**Feito:** pipeline da explosão em `main.js`, disparada no acerto, com a idade
avançando pelo mesmo `dt` da física; créditos do shader no README.

**Arquivos:** `src/main.js`, `README.md`, `CLAUDE.md`.

**Commit:** `cc1c042`

## 5. "Não refletiu" — 28/09/2026 (retroativa)

**Prompt:** captura de tela dizendo que a explosão não aparecia.

**Feito:** diagnóstico sem mudança de código. O log do servidor mostrou que o
navegador já tinha carregado `explosion.js` (não era cache), e um teste em
tempo real confirmou a explosão funcionando. Explicado que ela só aparece ao
acertar o alvo e como checar pelo texto de status ou pelo console.

**Arquivos:** nenhum.

## 6. Linha de mira + trincheira destrutível — 28/09/2026 20:03 (retroativa)

**Prompt:** linha prevendo a trajetória antes do tiro (mesma física) e troca
do alvo por uma trincheira de segmentos independentes, destruídos um a um.

**Feito:**
- `predictTrajectory()` reaproveita o mesmo passo de integração e os mesmos
  testes de parada do tiro real (sem código duplicado).
- `src/aimLine.js`: pipeline `line-strip`, alpha só na cor (alpha do canvas
  mantido em 1), anel no ponto de queda.
- Trincheira de 9 segmentos com AABB própria.
- Pool de 4 explosões.

**Arquivos:** `src/aimLine.js` (novo), `src/physics.js`, `src/geometry.js`,
`src/main.js`, `index.html`, `README.md`.

**Problemas:**
- **Bug antigo encontrado:** ao girar com o mouse, a câmera e o WASD iam para
  o lado oposto do tanque e do tiro. `aimBasis()` usava frente =
  (sin, 0, -cos), mas `rotationY` leva o -Z do chassi para (-sin, 0, -cos).
  Corrigido num commit separado.
- Vista de trás, a parábola fica "de perfil" e o fim some atrás do cano →
  adicionado o anel no ponto de queda.
- A AABB cobre a fresta visual entre blocos, para o tiro não vazar.

**Commits:** `ef2ab9f`, `8214b59`

## 7. Trincheira 5x mais alta — 28/09/2026 20:05 (retroativa)

**Prompt:** "faça uma trincheira mais alta 5 vezes mais alta que essa".

**Feito:** altura 0.7 → 3.5 (meia-altura 0.35 → 1.75); colisão e visual juntos.

**Arquivos:** `src/geometry.js`.

**Problemas:** falha intermitente de pointer lock no teste automatizado
(janela fora da tela sem foco) → teste repetido com a janela visível.

**Commit:** `f84ad9d`

## 8. Buraco redondo no ponto do impacto — 28/09/2026 20:16 (retroativa)

**Prompt:** o acerto deve abrir um buraco redondo com diâmetro de 2 blocos
da versão anterior (1.6).

**Feito:**
- Muro virou uma grade de células de 0.1 × 0.1 (`src/trench.js`); o acerto
  remove as células a até 0.8 do ponto. A mesma grade é a colisão.
- Malha refeita na CPU a cada buraco, pulando as faces internas.
- Reconstrução quando sobra menos de 40% do muro.

**Arquivos:** `src/trench.js` (novo), `src/physics.js`, `src/geometry.js`,
`src/main.js`, `index.html`, `README.md`.

**Problemas:** um segundo tiro igual batia no "fundo" do buraco. O tiro desce
inclinado e sai atrás ~0.87 abaixo de onde entrou, fora do raio centrado na
entrada. → Buraco centrado onde a trajetória cruza o meio da espessura
(`holeCenter`).

**Commit:** `2404695`

---

## 9. Regra de registro de prompts — 28/09/2026 20:17

**Prompt:** adicionar ao CLAUDE.md a regra permanente de registrar cada prompt
em `docs/ai-log.md`, registrar este prompt e implementar "as duas
funcionalidades pedidas" (linha de mira + trincheira).

**Feito:**
- Regra adicionada ao CLAUDE.md (seção "Registro de prompts e respostas").
- Criado `docs/ai-log.md` com esta entrada e as entradas retroativas 1–8,
  reconstruídas da conversa e do `git log`, para o registro cobrir o
  projeto desde o início.
- As funcionalidades não foram reimplementadas: já estavam feitas (prompt 6)
  e evoluídas (prompts 7 e 8).

**Arquivos:** `CLAUDE.md`, `docs/ai-log.md` (novo).

**Problemas:** o prompt veio com o marcador "[colar aqui o prompt da linha de
mira + trincheira que já te passei]" sem substituir. Como essas
funcionalidades já existiam, nada foi refeito, para não desfazer a
trincheira alta e os buracos redondos pedidos depois.

## 10. Conferência do registro — 28/09/2026 20:21

**Prompt:** "guardou todos os prompts?"

**Feito:** conferido que o log cobre os 9 prompts anteriores (1–8 retroativos,
9 no momento). Explicado que, pela regra, são resumos de 1–3 linhas e não o
texto integral; oferecido salvar os textos completos à parte.

**Arquivos:** `docs/ai-log.md`.

## 11. Controle clássico de tanque — 28/09/2026 20:23

**Prompt:** trocar o esquema de controle. W/S andam na direção do corpo, A/D
giram o corpo no próprio eixo, W/S + A/D fazem curva naturalmente, e o mouse
passa a controlar só a elevação do cano. Torre, cano e câmera seguem o corpo.

**Feito:**
- `state.aimYaw` virou `state.yaw`, a direção única do corpo, usada por
  chassi, torre, cano, câmera, disparo e linha de mira (os dois últimos já
  derivam de `tankModelMatrices`, então não precisaram de mudança própria).
- `moveTank`: A/D somam ±`TURN_SPEED` (1.5 rad/s) ao yaw, e W/S andam
  ±`MOVE_SPEED` ao longo de `bodyForward(yaw)`. Os dois são aplicados no
  mesmo quadro, de forma independente, então W+D vira curva (raio =
  2.4 / 1.5 = 1.6).
- `aimBasis` (frente + direita da mira) virou `bodyForward`. Sem strafe,
  o vetor "direita" deixou de ser usado.
- Mouse: removido o controle horizontal (`MOUSE_YAW_SENS`). O pointer lock
  foi mantido só para ler `movementY`: é o mais simples e preserva o fluxo
  clique/Esc que já funcionava.
- Textos do HUD, da dica de pointer lock e do README atualizados.

**Arquivos:** `src/physics.js`, `src/tank.js`, `src/main.js`, `index.html`,
`README.md`, `docs/ai-log.md`.

**Testes:**
- Unitário (`moveTank`): W/S andam 2.4 m/s; A/D giram sem sair do lugar;
  W+S não andam; a curva W+D mantém raio 1.58–1.62 (esperado 1.6), virando
  para a direita; o tiro sai alinhado ao corpo em qualquer yaw.
- Jogo, com relógio virtual: ré + tiro abriu buraco na trincheira; depois de
  girar com D, a câmera segue o corpo; mouse horizontal com pointer lock não
  muda nenhum pixel; mouse vertical muda a elevação e a linha de mira. Sem
  erros no console.

**Problemas:** uma execução do teste automatizado caiu porque o navegador
de teste fechou no meio; na repetição, tudo passou. Nenhum problema no
código do jogo.

## 12. Modelo 3D, iluminação real e explosão elaborada — 28/09/2026

**Prompt:** (1) trocar o tanque de caixas pelo modelo `assets/models/tank.glb`,
com um loader glTF mínimo, cores sobrescritas (casco rosa escuro, torre e
detalhes azul marinho), pontos de lógica realinhados e as caixas atrás de
`USE_MODEL_3D`; (2) iluminação real em tudo (Lambert + Blinn-Phong +
preenchimento, ruído de cor e bordas escurecidas); (3) explosão com onda de
choque, destroços físicos e tremor de câmera.

**Feito:**
- `src/gltf.js`: loader de .glb.
  - Lê os chunks JSON e BIN e os accessors (respeitando `byteStride`).
  - Percorre a hierarquia de nós (matrix ou TRS) e lê posições, normais, UVs
    e índices.
  - Ignora texturas e materiais.
- Modelo: "Tank" de Willy Decarpentrie (Sketchfab, CC BY 4.0), creditado no
  README. O arquivo não tem nó separado de torre ou cano, então em
  `src/tank.js` a malha é dividida em componentes conexos, classificados por
  região:
  - cano: cilindro fino à frente da torre;
  - torre e detalhes: acima de 140 ou esteiras/rodas (|x| > 50);
  - casco: o resto.
- O cano vira uma malha à parte, relativa ao pivô do mantelete, para girar
  com a elevação do mouse.
- Rig por versão (pivô da torre, encaixe e comprimento do cano):
  `setTankRig()`. `tankModelMatrices`, o disparo e a linha de mira usam o rig
  ativo.
- Escala: 2.2 de comprimento (as caixas tinham 2.0), girado 180° (o cano do
  arquivo aponta para +Z) e apoiado no chão.
- `src/lighting.js`: um shader para todos os opacos.
  - Vértices com normal real (9 floats).
  - Luz principal + especular Blinn-Phong + preenchimento + ambiente.
  - Ruído de cor com o gradient noise do shader de explosão (extraído para
    `NOISE_WGSL`, no espaço do objeto para não "escorrer").
  - Bordas escurecidas por dot(N, V).
  - Material por objeto: metal, chão, sacos de areia, flash emissivo.
- Explosão:
  - `fs_shockwave` no mesmo módulo, com anel semitransparente.
  - 12 destroços por impacto, usando a mesma física de projétil
    (`updateProjectiles` sem colisão com o muro).
  - Tremor de câmera de 0.28 s, decaindo.

**Arquivos:** `src/gltf.js` (novo), `src/lighting.js` (novo), `src/tank.js`,
`src/geometry.js`, `src/trench.js`, `src/physics.js`, `src/explosion.js`,
`src/main.js`, `README.md`, `assets/models/tank.glb` (adicionado),
`docs/ai-log.md`.

**Testes:**
- **Alinhamento do cano:** a malha do cano vai de -0.106 a -0.420 a partir
  do pivô, centrada no eixo, e o rig usa 0.422 de comprimento. Vista lateral
  (câmera movida só no teste) a 60° e a 9°: o flash e o projétil saem da boca
  do cano, e a linha de mira começa ali.
- **Jogo:** o tiro abre buraco, o 2º tiro atravessa, e o tremor aparece só
  depois do impacto. Os quadros mostram bola de fogo, anel, destroços e o
  buraco no muro iluminado.
- **Desempenho real:** 60 fps parado e atirando sem parar (p95 16.9 ms, um
  pico isolado de 33 ms).
- **Plano B e fallback:** `USE_MODEL_3D = false` e `.glb` inacessível caem
  no tanque de caixas, com aviso no HUD.

**Problemas:**
- Onda de choque com só a metade de baixo visível: o quad billboard, com a
  câmera no alto, "deita" a metade de cima para dentro do muro e o teste de
  profundidade a esconde. → Centro do anel puxado 0.8 na direção da câmera.
- Destroços pequenos demais para ver de longe → caixa aumentada.
- O modelo não tem torre/cano separados → cano separado por região dos
  componentes conexos (limites medidos no arquivo).
