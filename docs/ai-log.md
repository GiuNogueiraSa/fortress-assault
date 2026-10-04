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

## 13. Dano mais realista na trincheira — 28/09/2026 21:24

**Prompt:** os buracos pareciam "limpos" demais. Pedidos: (1) subdividir os
segmentos em sub-blocos com colisão própria; (2) remover um grupo irregular
de sub-blocos (raio aleatório de 0.4 a 0.8, 70% de chance por bloco na
borda); (3) marca de queimado na borda; (4) entulho estático no chão.

**Feito:**
- (1) Já atendido: desde a entrada 8 o muro é uma grade de 0.1 × 0.1 (8 × 35
  células por bloco antigo de 0.8), cada célula com colisão própria. O prompt
  descrevia a versão com 9 segmentos grandes, então a grade foi mantida.
- (2) `carveHole` com buraco irregular:
  - raio sorteado entre 0.4 e 0.8 por impacto;
  - dentro de 75% do raio tudo sai;
  - no anel da borda, cada célula sai com 70% de chance;
  - uma ondulação angular leve (2 senóides) tira o formato de círculo.
- (3) Valor `burn` por célula: as que sobram até 0.25 além da borda escurecem
  em direção a um marrom-preto (mais forte perto do buraco, com leve
  variação aleatória). O ruído de cor da iluminação continua atuando por
  cima. Vale para todas as faces da célula, inclusive as voltadas para dentro
  do buraco.
- (4) `rubbleForHole`: 4 a 8 lascas achatadas no chão, ao pé do buraco (60%
  do lado para onde o tiro ia). São estáticas, ficam até a trincheira ser
  reconstruída, com pool de 80.

**Arquivos:** `src/trench.js`, `src/main.js`, `README.md`, `docs/ai-log.md`.

**Testes:**
- Unitário, 5 buracos: raio de 0.44 a 0.71; removidas 51–144 células contra
  61–160 de um círculo perfeito; 3–9 células removidas fora do raio médio e
  3–16 mantidas dentro (contorno irregular); 100–149 células queimadas;
  entulho no chão e junto ao muro.
- Jogo: 3 tiros com câmera de perto (só no teste) mostram buracos
  irregulares, borda escura e entulho. Com a câmera normal: tiro abre
  buraco, tremor só no impacto, 2º tiro no mesmo ponto atravessa. Sem erros
  no console.

**Problemas:**
- O pedido (1) não batia com o código atual (já mais fino que o sugerido) →
  mantida a grade, registrado aqui.
- O raio aleatório de 0.4 a 0.8 substitui o diâmetro fixo de 1.6 pedido na
  entrada 8. Com buracos menores, um tiro inclinado repetido pode pegar a
  borda e alargar o buraco em vez de atravessar, o que é coerente com o
  dano.
- Os comandos de terminal ficaram temporariamente bloqueados (falha do
  verificador de permissões) no fim da entrada 12. O commit dela foi feito
  no início desta.

## 14. Resolução real do canvas + anti-aliasing (MSAA) — 28/09/2026 21:29

**Prompt:** o jogo parecia pixelado/serrilhado (principalmente objetos
pequenos). Pedidos: (1) resolução interna do canvas = tamanho em CSS ×
devicePixelRatio, com recálculo no resize e recriação das texturas; (2) MSAA
com sampleCount 4, textura de cor multisample resolvida no canvas e
profundidade com o mesmo sampleCount.

**Feito:**
- `index.html`: o canvas ganhou tamanho de exibição fixo em CSS
  (`min(900px, 100%)` × `min(560px, 100%)`). Antes o tamanho vinha dos
  atributos width/height; sem isso, aumentar `canvas.width` faria o canvas
  crescer na tela em vez de ganhar nitidez.
- `resizeRenderTargets()` em `main.js`:
  - calcula `clientWidth/Height × devicePixelRatio` (limitado a 2 e ao
    `maxTextureDimension2D`);
  - se mudou, atualiza `canvas.width/height`, destrói e recria a textura
    MSAA e a de profundidade, e recalcula a projeção (aspecto);
  - é chamada no listener de `resize` e também no início de cada quadro,
    uma comparação barata que pega zoom e mudanças de layout que não
    disparam `resize`.
- MSAA: `SAMPLE_COUNT = 4` em `multisample` nas 4 pipelines (iluminada,
  bola de fogo, onda de choque e linha de mira, que ganhou o parâmetro
  `sampleCount`). O color attachment desenha na textura multisample com
  `resolveTarget` = textura do canvas e `storeOp: "discard"`.
  `SAMPLE_COUNT = 1` desliga o MSAA (caminho sem resolve mantido).

**Arquivos:** `index.html`, `src/main.js`, `src/aimLine.js`, `docs/ai-log.md`.

**Testes:**
- Mesma cena (relógio virtual) antes e depois, ampliada: as silhuetas do
  tanque (esteiras, torre) saem de degraus para bordas suavizadas.
- Resolução interna: DPR 1 → 900×560; 1.25 → 1125×700; 1.5 → 1350×840;
  2 → 1800×1120. Com a janela redimensionada para 600×400, 1400×900 e de
  volta, a resolução acompanha (em 600×400 a DPR 2 → 1200×800), sem erros.
- Desempenho real atirando sem parar: DPR 1 ~59 fps; 1.25 e 1.5 ~58 fps
  (p95 17 ms); DPR 2 ~52 fps (p95 33 ms) → teto de 2 no devicePixelRatio.

**Problemas:**
- A borda da bola de fogo continua recortada: ela vem do `discard` no
  fragment shader (recorte do efeito), não de arestas de triângulo, e o
  MSAA só suaviza arestas. É o esperado. Suavizá-la exigiria
  alpha-to-coverage ou blending no efeito.
- Uma medição em DPR 1.5 deu 0.2 fps com resolução inalterada: a janela de
  teste ficou parada (troca de janela). Repetida isoladamente, deu 58 fps.

## 15. Tela preta no navegador embutido do VS Code — 28/09/2026 21:32 (em investigação)

**Prompt:** captura de tela: depois da entrada 14 (resolução real + MSAA),
o canvas fica todo preto no navegador embutido do VS Code, com o status
"WebGPU ativo".

**Feito:**
- Tentativa de reproduzir no Chrome com painel do mesmo tamanho (730×580)
  e DPR 1 / 1.25 / 1.5, e também em 500×350: renderiza normalmente, sem
  erros. O problema é específico do navegador embutido, que renderizava
  antes dessa mudança.
- Como erros de validação do WebGPU não lançam exceção (só aparecem no
  console, que esse navegador não mostra), foi adicionado diagnóstico no
  HUD:
  - `device` `uncapturederror` → "Erro de GPU: ...";
  - `device.lost` → "GPU perdida: ...";
  - loop do quadro com try/catch → "Erro no quadro: ...", e o loop segue
    em vez de morrer silenciosamente.

**Arquivos:** `src/main.js`, `docs/ai-log.md`.

**Testes:** no Chrome, jogo e explosão continuam funcionando, sem mensagens
de erro.

**Próximo passo:** aguardando a mensagem que aparecer no HUD do navegador
embutido para corrigir a causa.

## 16. Buracos recortados no shader + escombros com forma de pedra — 28/09/2026 21:44

**Prompt:** os buracos pareciam "feitos de cubos" e os destroços eram cubos.
Pedidos: (1) buracos por shader: segmentos simples, lista de impactos (centro,
raio) no fragment shader, raio perturbado por ruído (o mesmo da explosão),
discard dentro e faixa queimada na borda; (2) destroços como poliedros
irregulares (vértices deslocados, escala não uniforme e rotação aleatórias),
usados nos que voam e nos que ficam no chão.

**Feito:**
- `trench.js` reescrito:
  - 9 segmentos (caixas) de malha fixa e uma lista de até 32 buracos
    (x, y no plano do muro, raio 0.4–0.8, semente do ruído), enviada ao
    shader num uniform (`holesUniformData`).
  - Reconstrução com 60% da face destruída (amostragem de pontos) ou com a
    lista cheia.
- `lighting.js`: a iluminação virou `shade()`, e `fs_trench` foi adicionado.
  - Para cada buraco, o raio de corte é perturbado por 2 oitavas de
    `noise()` (formato + rasgos finos).
  - Pixels dentro do corte são descartados (vazado de verdade).
  - Numa faixa de 0.28 fora do corte, a cor vai para marrom-preto, com
    manchas de ruído.
  - Buracos longe do pixel pulam o ruído (custo só perto dos buracos).
  - Os buracos ficam num 2º bind group, usado só pela pipeline da
    trincheira.
- `geometry.js`: `buildRock()`.
  - Parte de um icosaedro; cada vértice é deslocado para dentro/fora (fator
    0.65–1.2) e cada eixo é esticado de forma diferente (achatado/alongado).
  - Normais por face (facetado) e leve variação de tom por face.
  - `main.js` gera 16 formas na largada; cada destroço/entulho sorteia forma,
    tamanho e rotação.
- A colisão voltou a ser por segmento (caixa de cada um), **menos** os
  círculos dos buracos no raio médio, para o tiro passar por onde a parede
  sumiu.

**Arquivos:** `src/trench.js`, `src/lighting.js`, `src/geometry.js`,
`src/main.js`, `README.md`, `docs/ai-log.md`.

**Testes:**
- Unitário:
  - colisão vazada no centro e a 0.9 do raio, sólida a 1.1 do raio e na
    emenda entre segmentos;
  - lista limitada a 32 com flag de cheia; reset zera;
  - pedra com 20 faces, normais para fora, forma diferente a cada chamada.
- Jogo com câmera de perto (só no teste): buracos rasgados, vazados, com
  borda queimada; entulho com cara de pedra quebrada.
- Câmera normal: tiro abre buraco, tremor só no impacto, 2º tiro no mesmo
  ponto atravessa.
- Desempenho atirando: DPR 1 e 1.5 ~58 fps, DPR 2 ~51 fps (igual à entrada
  14). Sem erros no console.

**Problemas:**
- Com os segmentos separados por uma fresta visual (0.74 de 0.8), via-se o
  chão atrás do muro em linhas verdes. Com buracos por shader a fresta não
  serve mais → segmentos encostados, e a divisão fica pela cor alternada.
- Entulho pequeno demais para ver → tamanho aumentado (pedra ~0.16–0.32).
- Limitação conhecida: o contorno rasgado existe só no shader. A colisão
  usa o círculo de raio médio que o ruído perturba, então na borda o
  visual e a colisão diferem um pouco. Também não há "parede interna" no
  buraco: a espessura do muro não aparece pela abertura, mas a faixa
  queimada disfarça.

## 17. Análise comparativa Claude × Gemini × ChatGPT (conversão do shader) — 04/10/2026 16:18

**Prompt:** ler `docs/Resposta 1 ChatGPT.txt` e `docs/Resposta 1 Gemini.txt`
(respostas ao mesmo prompt de conversão do shader da entrada 3) e criar
`docs/analise-ias.md`, com resumo executivo, comparação técnica, tabela rápida
e conclusão.

**Feito:**
- Em vez de comparar só lendo, o WGSL de cada resposta foi extraído sem
  alterações, compilado no Chrome e executado com os mesmos parâmetros, ao
  lado do GLSL original (WebGL2), em 5 instantes. Foi medida a % de pixels
  diferentes.
- Resultado:
  - Claude e ChatGPT: ≤ 0,03% de diferença;
  - Gemini: 12–31% (metade do tamanho e sem contorno), e o `Float32Array`
    da própria resposta é rejeitado pelo WebGPU (192 bytes para uma struct
    de 208, por causa do alinhamento de `vec3`).
- As afirmações das explicações foram checadas compilando trechos mínimos.
  - Duas do Gemini são falsas: `1.` é literal válido, e array `let` aceita
    índice dinâmico.
  - Uma do Claude também é falsa: `repeat` e `point` não são palavras
    reservadas; só `fn`.
- O documento registra que foi escrito pelo Claude (uma das IAs comparadas)
  e que as condições foram diferentes (o Claude tinha o repositório e
  ferramentas; as outras, só o chat), além da limitação de ser uma única
  tarefa.

**Arquivos:** `docs/analise-ias.md` (novo), `docs/Resposta 1 ChatGPT.txt` e
`docs/Resposta 1 Gemini.txt` (adicionados ao repositório como fonte da
análise), `docs/ai-log.md`.

**Problemas:**
- Na primeira extração, o vertex shader do ChatGPT deu "unexpected token":
  a faixa de linhas copiada incluía uma frase de texto no meio do código.
  Era erro da extração, não da resposta → linha de prosa removida, e o
  vertex compila.
- O servidor local estava parado desde a sessão anterior → reiniciado.

## 18. Visual: tanque amarelo com onça, paredão de concreto, céu com sol — 04/10/2026 16:40

**Prompt:** mudanças só estéticas, mantendo a jogabilidade:
(1) tanque amarelo com detalhes pretos e estampa de onça procedural;
(2) trincheira azul escura, mais alta (5–6), com relevo de blocos, detalhes
vinho e verdes por ruído;
(3) destroços menores (0.08–0.16), em maior número (24–32), com variação de
cor e onda de choque mais sutil;
(4) céu em gradiente com sol no horizonte e luz na direção do sol;
(5) mais preenchimento, brilho do sol no chão, mantendo ~50+ fps com MSAA 4.

**Feito:**
- **Tanque (`tank.js`, `lighting.js`).**
  - A classificação das peças ganhou "turret": casco e torre em
    `TANK_BODY_COLOR` (0.95, 0.85, 0.1); cano, esteiras e rodas em
    `TANK_DETAIL_COLOR` (quase preto).
  - Estampa de onça no fragment shader (material `tankPaint`): células de
    Voronoi (F1, com os pontos do `n_rand3` do shader de explosão) com borda
    perturbada por ruído. Formam rosetas (anel marrom (0.4, 0.2, 0.05) e
    miolo mais escuro) no espaço do objeto, aplicadas só nas partes amarelas.
- **Paredão (`trench.js`, `fs_trench`).**
  - Altura 3.5 → 5.5, cor base azul (0.08, 0.12, 0.35).
  - Blocos de concreto em fiada: juntas escuras e **chanfro só na normal**
    (sem geometria extra), rugosidade por ruído e tom diferente por bloco.
  - Franja vinho no topo e nas pontas, com borda irregular.
  - Manchas verdes orgânicas mais frequentes perto da base.
  - Os buracos e o queimado continuam iguais.
- **Destroços (`main.js`, `geometry.js`).**
  - 24–32 por impacto, tamanho 0.08–0.16, mais espalhados, pool de 128.
  - Formato de **lasca** (`buildRock(..., flat=true)`, achatada num eixo).
  - Cor por pedaço: tinta sorteada (concreto azul, escuro, terra, vinho,
    verde, com brilho variando), e 40% com manchas.
  - O entulho do chão também ficou menor e colorido.
- **Onda de choque:** 0.6 → 0.4 s e opacidade 0.8 → 0.4.
- **Céu (`src/sky.js`).**
  - Triângulo em tela cheia desenhado primeiro, sem profundidade.
  - A direção de visão é refeita pelos eixos da câmera.
  - Gradiente laranja (horizonte) → azul (alto), mais disco do sol e halo.
- **Luz e ambiente.**
  - A luz principal usa o azimute do sol, cor quente.
  - Preenchimento mais forte (0.25 → 0.60) do lado da câmera.
  - Ambiente hemisférico (céu/chão).
  - Brilho especular no chão.
  - Névoa leve na distância, na cor do horizonte, que integra o chão ao céu.
- **Uniform por objeto:** 160 → 176 bytes (`extra` = padrão + tinta).

**Arquivos:** `src/lighting.js`, `src/sky.js` (novo), `src/tank.js`,
`src/trench.js`, `src/geometry.js`, `src/explosion.js`, `src/main.js`,
`README.md`, `docs/ai-log.md`.

**Testes:**
- Capturas da câmera normal, de lado (tanque) e de perto (paredão): onça
  em rosetas, blocos com relevo, vinho e verde, sol visível no horizonte e
  através dos buracos, lascas coloridas.
- Fluxo de tiro, buraco, tremor e 2º tiro atravessando; controles
  (W/S/A/D, curva, mouse só vertical).
- Plano B e fallback do modelo.
- Desempenho atirando: DPR 1 / 1.25 / 1.5 → 60 fps; DPR 2 → 55 fps. Sem
  erros no console.

**Problemas:**
- A estampa saiu com pintinhas pequenas e densas → frequência das células
  7.5 → 3.4, e viraram rosetas grandes.
- **Sol fora de quadro:** a câmera olha ~20° para baixo e só enxerga até
  ~1.5° acima do horizonte; à frente, o paredão cobre o horizonte (±14°).
  → O disco foi desenhado a 0.5° de elevação e 22° de azimute, mas
  a luz usa o mesmo azimute com 30° de elevação (senão nada seria iluminado
  por cima). É uma "trapaça" de composição, documentada no código.
- O sol, à direita, ficou escondido atrás do painel de controles do HUD
  (que cobre o canto do canvas) → movido para a esquerda (−22°).
- Com o sol à frente, a face do paredão fica contra a luz e escura →
  preenchimento e ambiente aumentados.
- Uma medição em DPR 1.5 travou (janela de teste sem foco, como na
  entrada 14) → repetida isoladamente: 60 fps.
