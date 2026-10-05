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

## 19. "Nada mudou" depois da entrada 18: cache do navegador + servidor duplicado — 04/10/2026 16:48

**Prompt:** captura de tela mostrando o jogo antigo (tanque rosa e azul,
muro marrom de 3.5, céu azul liso) depois das mudanças visuais da entrada 18.

**Diagnóstico:**
- O servidor entregava o código novo (`curl` confirmou `createSky` e
  `TANK_BODY_COLOR`). Então o problema não era o código, era cache.
- O `python -m http.server` não manda `Cache-Control`. Sem esse cabeçalho, o
  navegador decide sozinho (cache heurístico, pela idade do `Last-Modified`)
  reaproveitar os módulos `.js` antigos sem perguntar ao servidor.
- Além disso, havia **dois servidores** na porta 8000: um `http.server`
  antigo, de uma sessão anterior, ainda escutando em IPv6 (`::`), e o novo em
  IPv4. Como `localhost` resolve primeiro para `::1`, era o antigo que
  respondia.

**Feito:**
- `serve.py`: o mesmo servidor de arquivos do Python, mas com
  `Cache-Control: no-store` em toda resposta e escutando em IPv6 + IPv4 ao
  mesmo tempo (`IPV6_V6ONLY = 0`), para não ser "atropelado" por outro
  processo na mesma porta.
- Parado só o processo que estava na porta 8000 (os dois servidores antigos
  deste projeto, identificados pela linha de comando), sem fechar outros
  processos Python.
- README: rodar com `python serve.py`.

**Arquivos:** `serve.py` (novo), `README.md`, `docs/ai-log.md`.

**Testes:** `localhost`, `127.0.0.1` e `[::1]` respondem com
`Cache-Control: no-store` e o `main.js` novo.

**Observação:** o navegador que já tinha os arquivos antigos em cache
precisa de **um** recarregamento forçado (Ctrl+Shift+R / Ctrl+F5) ou ser
reaberto. Daí em diante, cada recarregamento comum pega a versão atual.

## 20. Fortaleza destrutível com pátio + realismo do tanque — 04/10/2026 17:22

**Prompt:** (1) trocar o muro por uma fortaleza (parede frontal de 8–10, portão
de 2.5 × 3, torres, detalhes) com um pátio interno de luz amarela e quente;
(2) paleta só azul / verde (hera) / vermelho e rosa (flores) / amarelo mínimo /
preto e branco muito pouco; (3) destroços azuis e verdes; (4) sol iluminando a
parede, preenchimento azul claro; (6) tanque com as **mesmas cores**, mas com
desgaste, mais especular no metal, sulcos nas esteiras, onça com mais contraste
e cano com mais volume. O prompt pedia "entrada 18", mas 18 e 19 já existiam,
então esta é a 20.

**Feito:**
- **Fortaleza (`trench.js` reescrito).**
  - Parede frontal de 9 de altura (z = −9, 15.6 de largura) com vão de
    portão de 2.5 × 3.
  - Duas torres de guarda de 10.5 saindo 0.8 para fora, ameias no topo da
    parede e das torres, e um friso horizontal saliente (desnível).
  - Pátio de ~14 × 8 fechado por paredes laterais e de fundo (7.5), com um
    canteiro no meio. O chão foi ampliado para 60 × 60.
- **Portão.**
  - Painel recuado com dobradiças e trinco amarelos (o único amarelo da
    fortaleza além de flores raras).
  - Cai com `DOOR_HP = 3` acertos. Os furos nele são só marcas (raio
    menor): ele bloqueia tiros e tanque inteiro até cair.
- **Colisão do tanque (nova):** círculo de raio 1.1 contra as caixas que
  tocam o chão (`tankBlocked`). `moveTank` testa o movimento e, se bater,
  tenta cada eixo separado (desliza na parede). Antes o tanque atravessava
  tudo; agora o portão realmente impede a entrada.
- **Buracos.**
  - Cada um guarda a fatia de profundidade (zMin..zMax) da caixa atingida,
    para não furar também a parede do fundo no mesmo x,y. O uniform passou a
    ter 2 vec4 por buraco (até 40).
  - O centro fica no meio da espessura da caixa atingida.
  - Paredes laterais e o friso não aceitam buracos.
  - Reconstrução com 50% da fachada destruída, e nunca com o tanque no vão
    do portão (senão ele ficaria preso).
- **Shader da fortaleza (`fs_trench`).**
  - Blocos azuis (0.15, 0.25, 0.5) com chanfro na normal.
  - Hera verde em manchas esticadas na vertical, mais densa embaixo, com
    dois verdes e relevo de folhas.
  - Flores vermelhas/rosas só sobre a hera (grade com jitter) e amarelo raro
    (2,5% das flores).
  - Queimado em preto. Saíram a franja vinho, as algas e o marrom.
- **Pátio quente:** fora do pátio a luz não muda. Dentro dele (`yardWarmth`,
  pela posição no mundo):
  - o ambiente vira amarelo quente;
  - o sol fica mais intenso;
  - a borda da zona fica no meio da espessura das paredes, então a face
    interna recebe a luz quente e a externa não;
  - vale também para o tanque quando entra.
- **Sol e ambiente.**
  - O sol foi para **trás da câmera inicial** (azimute 150°, luz a 35°),
    para iluminar a fachada de frente (ela olha para +Z). O disco do sol
    aparece quando o tanque se vira.
  - Preenchimento azul claro (luz do céu), vindo do lado oposto.
  - Névoa começando mais longe (26), para não tingir a fortaleza com a cor
    do horizonte.
- **Destroços:** tintas só azul (65%) e verde (35%), com brilho variando.
- **Tanque (cores iguais).**
  - Desgaste: sujeira e tinta gasta como variação de brilho do mesmo
    amarelo, mais forte perto do chão.
  - Onça com bordas mais duras, anel mais largo e miolo mais escuro.
  - Partes escuras (rodas, esteiras): estrias de alto contraste ao longo do
    comprimento e especular forte.
  - Cano: especular 1.0, brilho 80 e rim mais forte (mais volume
    cilíndrico).
  - Novo campo `look` (rim por material) no uniform (176 → 192 bytes).

**Arquivos:** `src/trench.js`, `src/lighting.js`, `src/physics.js`,
`src/geometry.js`, `src/main.js`, `index.html`, `README.md`, `docs/ai-log.md`.

**Testes:**
- **Colisão do tanque (unitário):** com o portão fechado, para em
  z = −8.14 (portão + raio); aberto, entra até o canteiro (z = −11.9);
  dentro, a parede lateral o para em x = 5.88.
- **Jogo, tiro baixo no portão:** "1/3", "2/3", "Portão derrubado!". O
  tanque entra no pátio, a luz fica amarela lá dentro e os destroços saem
  azuis e verdes.
- **Paleta medida na imagem (região da fachada):** 49% azul, 46% verde
  (hera), flores 6.2% da área de hera, amarelo 0.9%.
- **Controles, plano B e fallback:** OK.
- **Desempenho:** com um navegador isolado por densidade de tela, 60 fps em
  DPR 1, 1.5 e 2, parado e atirando perto do muro.

**Problemas:**
- O 2º e o 3º tiros no portão passavam pelo buraco do 1º e acertavam o chão
  do pátio → no portão os furos viraram só dano visual, e o portão bloqueia
  até cair.
- **Desempenho:** com a fachada cobrindo meia tela, o shader fazia ~11
  gradient noise 3D por pixel. A medição deu ~39 fps em DPR 1.5 e ~25 em
  DPR 2, mas feita com várias janelas no mesmo navegador, método que já
  tinha falhado antes.
  - Mesmo assim, otimizado: value noise 2D barato (4 hashes) nos padrões da
    superfície, o gradient noise só na borda dos buracos, queimado só perto
    deles, e sem a variação de cor genérica na fortaleza.
  - Depois, medido com um navegador por densidade: 60 fps em todas.
- A troca de ruído mudou a cobertura da hera (de 39% para 57% na 1ª
  tentativa) → limiar ajustado pelo meio, medindo na imagem. As flores
  estavam em 3.8% da hera → mais frequentes (6.2%).
- Luz amarela forte sobre o azul deixava as paredes do pátio acinzentadas
  (fora da paleta) → amarelo do pátio menos saturado.
- O céu (horizonte laranja) e o fogo da explosão (shader externo) não fazem
  parte da fortaleza e não foram alterados pela restrição de paleta.

## 21. Castelo medieval, mundo mais realista, sombras e explosão nova — 04/10/2026 18:05

**Prompt:** redesenhar a fortaleza e o mundo para parecerem realistas ("não
Minecraft").
- Castelo: duas torres cilíndricas de 12–15 com ameias, muralhas de ~10,
  portão em arco com passagem de 1–1.5 de profundidade, largura ~20 e
  profundidade ~8.
- Hera em 30–50% e flores em ~5%.
- Céu com sol grande e nuvens; grama, ondulação e musgo no chão; 3–5 árvores.
- Sol quente, preenchimento azul e **sombras**.
- Explosão: 40–60 partículas de 0.05–0.25 que somem aos poucos, anel branco
  de 0.5 a 3 em 0.2 s, fogo laranja/amarelo que sobe, tremor de 0.15 s ±0.1
  e clarão.
- Pedia "entrada 18"; esta é a 21.

**Antes de começar:** como a apresentação é amanhã, a versão anterior,
estável, foi marcada com a tag git `v-estavel-fortaleza`
(`git checkout v-estavel-fortaleza` volta para ela).

**Feito:**
- **Castelo (`trench.js`).**
  - Duas torres **cilíndricas** (28 lados com normais suaves, raio 1.65,
    altura 13.5 + ameias ≈ 14.3), com anel saliente perto do topo e 10
    ameias em volta.
  - Muralha frontal de 10 (largura 20), muralhas laterais e de fundo de 9,
    ameias em toda a extensão e pátio de ~18 × 7.
  - **Portão em arco:** pés-direitos de 1.75 + semicírculo (topo a 3.0,
    largura 2.5). A malha sobre o vão é recortada em arco, com intradorso
    (teto curvo) e uma passagem de 1.2 através da muralha. A folha do portão
    tem o formato do arco e dobradiças amarelas.
  - **Colisão:** o arco é recortado (tiro passa pelo vão, bate acima dele);
    as torres usam colisão circular.
- **Pedras (`fs_trench`):** alvenaria de pedras irregulares por **Voronoi 2D**
  (juntas escuras pela diferença F2−F1). Cada pedra é abaulada na normal e
  tem tom próprio. Nas torres a coordenada é ângulo × altura.
- **Hera e flores:** a hera é mais densa nas torres e nos cantos, e as
  flores ficam só sobre ela. A passagem do portão escurece até quase preto
  no meio da espessura (sombra de profundidade).
- **Sombras:** shadow map 2048² do sol (ortográfica), PCF 3×3 (borda
  suave), depth bias contra "acne". Projetam sombra: tanque, castelo,
  árvores, entulho e projéteis. Os buracos da muralha deixam a luz passar
  (o passe de sombra também descarta os pixels dentro deles).
- **Chão:** grama com variação clara/escura, fiapos, ondulação na normal,
  musgo (0.05, 0.12, 0.05), brilho leve (orvalho) e escurecimento de
  contato junto à base do castelo.
- **Árvores (`src/scenery.js`):** 5 árvores (tronco cilíndrico + 3 esferas
  achatadas de normais suaves), atrás e dos lados.
- **Céu:** sol maior (~2.5°) com halo e nuvens procedurais douradas do lado
  do sol.
- **Luz.**
  - Sol (1.0, 0.9, 0.7).
  - Preenchimento azul (0.3, 0.4, 0.6) vindo de cima.
  - Pedra com especular de "úmida" e cano com especular 1.2.
  - Pátio com luz quente mais forte.
- **Explosão.**
  - 40–60 lascas de 0.05–0.25 (mais pequenas), mais horizontais, girando,
    com a mesma física (`stepProjectile`). Quicam uma vez no chão e somem
    aos poucos: o alpha vira cobertura das amostras do MSAA
    (**alpha-to-coverage**), sem precisar ordenar transparências.
  - Cores azul, verde e vermelho/rosa.
  - Anel de choque branco (alpha 0.3 → 0), de 0.5 a 3 em 0.2 s.
  - Fogo com núcleo amarelo/laranja e borda vermelha/marrom (paletas do
    shader externo trocadas, documentado no cabeçalho), subindo 0.5/s.
  - Tremor de 0.15 s ±0.1 no plano da tela, com decaimento quadrático.
  - **Clarão:** luz pontual laranja por 0.12 s.

**Arquivos:** `src/trench.js`, `src/lighting.js`, `src/scenery.js` (novo),
`src/sky.js`, `src/explosion.js`, `src/geometry.js`, `src/math.js`
(ortográfica WebGPU), `src/physics.js`, `src/main.js`, `index.html`,
`README.md`, `docs/ai-log.md`.

**Testes:**
- **Vistas de teste** (câmera movida só no teste: frente, lado e pátio):
  torres, ameias, arco, árvores, nuvens e sombras.
- **Cobertura medida na imagem:** hera 36% (meta 30–50%), flores 5.5% da
  hera (meta ~5%).
- **Portão:** 1/3 → 2/3 → derrubado. O tanque entra pelo arco, anda pelo
  pátio até a parede lateral e o pátio aparece claro e quente.
- **Explosão:** anel, fogo e fumaça; tremor só no impacto.
- **Controles, plano B e fallback:** OK.
- **Desempenho (navegador isolado por densidade):** DPR 1 → 60 fps;
  1.5 → 57–60.

**Problemas:**
- **Hera:** cobria ~80% (torres quase todas verdes) → limiar e reforço nas
  torres reduzidos. Ficou em 30% na 2ª tentativa e em 36% na 3ª.
- **Musgo:** manchas grandes e escuras demais no chão → menos cobertura e
  intensidade.
- **Canteiro:** a 2.2 da muralha, a mesma medida do diâmetro do tanque; o
  tanque entrava e ficava preso → canteiro mais para dentro do pátio.
- **Pátio escuro:**
  - com sombras reais, a muralha esquerda (9 de altura, sol a 35°) cobre a
    maior parte do pátio → luz ambiente quente do pátio mais forte;
  - além disso, o escurecimento de contato do chão usava a distância ao
    castelo, que é **negativa dentro do pátio**, e escurecia o chão inteiro
    → `abs()` da distância.
- **Fogo cortado no portão:** com o tiro no portão (dentro da passagem), o
  arco escondia a metade de cima da bola de fogo → ela também é puxada 0.8
  na direção da câmera, como o anel.
- **Desempenho em DPR 2:** 43–47 fps (sombras + castelo a 1800×1120 com
  MSAA 4) → teto do devicePixelRatio de 2 para 1.5. Telas 2x renderizam a
  1.5x: 58–60 fps.
- **Fora do escopo:**
  - profundidade de campo (opcional no pedido), para não arriscar o
    desempenho na véspera;
  - sol "no horizonte iluminando a fachada": impossível com ele à frente
    (a fachada ficaria contra a luz). Ele vem de trás-esquerda, em luz
    rasante, e aparece no horizonte quando o tanque vira para a esquerda.

## 22. Castelo destrutível por inteiro, travessia até o horizonte — 04/10/2026 21:56

**Prompt:** "Precisamos conseguir acertar cada parte do castelo por dentro e
por fora para conseguir atravessá-lo e ir para o horizonte."

**O que impedia:**
1. Muralhas laterais, torres, ameias e canteiro não aceitavam buracos.
2. O buraco era definido no plano x,y com fatia em z, então só funcionava
   em paredes que olham para ±Z.
3. A colisão do tanque ignorava os buracos.
4. O chão tinha 60 × 60 e os projéteis sumiam a 20 unidades.

**Feito:**
- **Tudo destrutível** (`trench.js`): muralhas, torres, ameias e canteiro;
  o portão continua caindo com 3 tiros.
- **Buraco = cilindro** ao longo da direção HORIZONTAL do tiro (centro,
  direção, raio, meio-comprimento 1.0), com seção oval 1.3× mais alta que
  larga (explosão rasga na vertical).
  - Funciona em qualquer parede, de qualquer lado, e atravessa a espessura.
  - Mesma conta no shader (cor e sombra) e na colisão (JS).
  - Até 96 buracos.
- **Colisão do tanque por amostragem:** centro + anéis de 0.42 e 0.85 em
  duas alturas (0.7 e 1.05), contra o mesmo teste de sólido do projétil.
  Bloqueia só com 3+ pontos no sólido: os pedacinhos na borda rasgada de
  uma brecha o tanque empurra.
- **Cano pode apontar para baixo** (`PITCH_MIN` 0.05 → −0.15 rad).
- **Mundo:** chão de 400 × 400 e projéteis valendo até 200 de distância.
- **Câmera:** se uma parede fica entre o tanque e a câmera, ela se aproxima
  (não fica mais dentro da alvenaria).
- **Segurança:**
  - Se o tanque estiver dentro de algo, pode sempre sair.
  - O castelo só é reconstruído com o tanque longe dele, para não prender o
    tanque nem tampar o caminho aberto.
  - `window.__game` (estado e castelo) exposto só para testes e depuração.

**Arquivos:** `src/trench.js`, `src/lighting.js`, `src/physics.js`,
`src/geometry.js`, `src/main.js`, `index.html`, `README.md`, `docs/ai-log.md`.

**Testes:**
- **Lógica (mesma física do jogo), travessia completa:** fura a frontal por
  fora → cruza o pátio → recua → fura o fundo por dentro → anda até
  z = −168. **8 de 8** chegaram, com 1 rajada de 15 tiros por muralha.
- **Torre e muralha lateral:** aceitam buraco.
- **Jogo real, mira com o mouse (pointer lock):** duas varreduras na
  frontal; o tanque entra no pátio, recua, faz duas varreduras no fundo (com
  o cano apontando para baixo) e sai do castelo até z = −47. As capturas
  mostram as brechas e o tanque no campo aberto.
- **Regressão:** portão (1/3 → 2/3 → derrubado), explosão, tremor,
  controles, plano B e fallback.
- **Desempenho:** ~58–60 fps em DPR 1 e 1.5.

**Problemas encontrados e corrigidos:**
- **Brecha difícil demais:** a colisão do tanque (raio 1.05, alturas até
  1.45) exigia buracos quase sempre do raio máximo → amostras no tamanho do
  casco.
- **Tanque preso numa "aba" invisível:** com o eixo do buraco inclinado
  (tiro descendo), a abertura saía mais baixa na face de trás → eixo só
  horizontal.
- **Borda inferior de ~0.5 segurando o tanque** → buraco oval vertical e o
  tanque sobe bordas até 0.7.
- **Um único ponto da borda rasgada bloqueava** → regra de 3+ pontos.
- **De perto, o tiro saía sempre a ~1.5 de altura** (altura da boca do
  cano) e não dava para abrir brecha rente ao chão → cano pode apontar
  ~9° para baixo.
- **Câmera dentro da parede ao atravessar** → câmera se aproxima do tanque.
- **Erro do próprio teste:** a função que mexia o mouse voltava o cursor ao
  ponto inicial, e a elevação nunca mudava → corrigida antes do teste final.

## 23. Menu, sistema de missões, controles novos, flores e onça — 04/10/2026 23:17

**Prompt:** "Grande redesign final":
- menu de abertura (FORTRESS ASSAULT, Começar / Tutorial / Créditos; M/Esc
  reabre);
- controles: setas no cano, mouse = câmera 360°, movimento com inércia;
- flores vibrantes (~12% da hera) e onça com pintas pretas lisas;
- 3 missões com progressão:
  1. fácil;
  2. torres contra-atacam, 75 tiros, 5 impactos;
  3. mais agressiva, 3 tanques inimigos, 100 tiros, 180 s;
- vitória/derrota, HUD, minimapa e progresso salvo.

O prompt pedia "entrada 19"; esta é a 23. A versão anterior, estável, foi
marcada com a tag `v-estavel-travessia`.

**Feito:**
- **Menu (`menu.js`, `index.html`).**
  - HTML por cima do canvas, com o jogo renderizando atrás (a câmera dá
    voltas no castelo ao pôr do sol). Desvanece ao começar.
  - Telas: tutorial, créditos e fim de missão.
  - Missões 2 e 3 bloqueadas até completar a anterior (`localStorage`, com
    try/catch: sem armazenamento o jogo funciona, só não salva).
  - **M** (ou Esc com o mouse solto) pausa e mostra "Continuar".
- **Missões (`missions.js`).** Uma tabela por missão: escala do castelo
  (1.0 / 1.12 com torres ~16 / 1.25 com ~18 de altura e 25 de largura),
  reforço de hera, acertos por setor, resistência do portão, cadência e
  precisão das torres, tanques inimigos, munição, vida e tempo.
- **Castelo escalável (`trench.js`, `lighting.js`).**
  - A geometria, os buracos e as colisões ficam em coordenadas LOCAIS; a
    escala vai só na matriz de modelo e a API converte mundo ↔ local.
  - O shader do castelo (cor e sombra) usa a posição local, então pedras,
    buracos e a passagem do portão funcionam em qualquer tamanho.
  - **Setores:** Torre esq. | Portão | Torre dir., pelo x do impacto. Os
    lados perdem 1/N por acerto e o portão é a própria folha.
- **Controles.**
  - Setas ↑/↓ no cano.
  - Mouse orbita a câmera (0.003 rad/px; elevação limitada para não entrar
    no chão).
  - `moveTankSmooth`: velocidade de andar e de girar com lerp de 0.15 por
    quadro (independente do fps).
- **Inimigos (`enemies.js`).**
  - Mira balística: ângulo de trajetória baixa para acertar o alvo com
    rapidez fixa.
  - Torres atiram só depois do 1º tiro do jogador, alternando, e só se o
    setor delas ainda estiver de pé.
  - Missão 2: mira onde o tanque está, com erro. Missão 3: prevê a posição
    pela velocidade do tanque.
  - Tanques inimigos (mesma malha do jogador, avermelhados, sem onça)
    viram para o jogador e atiram. Um acerto os destrói, e eles bloqueiam a
    passagem.
  - Tiros inimigos são cubos laranja emissivos.
- **Dano:** 5 impactos destroem o tanque. Marcas de queimado no tanque
  crescem com o dano (no shader, sem cortar o modelo).
- **HUD (`hud.js`):** barras dos 3 setores, HP, munição, tempo (vermelho
  abaixo de 30 s, com bipe do WebAudio), tanques restantes, avisos
  ("⚠ IMPACTO! Saúde: X%") e minimapa.
- **Vitória:** a câmera voa para o pátio em 2 s (suavizado), o pátio brilha
  mais e aparecem a mensagem e as estatísticas.
- **Derrota:** munição acabou, tanque destruído ou tempo esgotado →
  "Tentar de novo" ou "Menu".
- **Flores:** vermelho (0.85, 0.05, 0.12) grandes, rosa (0.92, 0.25, 0.45)
  médias e amarelo (0.98, 0.92, 0.05) pequenas, com miolo amarelo, em
  ~12% da hera.
- **Onça:** pintas PRETAS (0.08) lisas e levemente ovais, em parte das
  células de Voronoi (~18 no casco, ~10 na torre).

**Arquivos:** `index.html`, `src/main.js`, `src/missions.js` (novo),
`src/menu.js` (novo), `src/hud.js` (novo), `src/enemies.js` (novo),
`src/trench.js`, `src/lighting.js`, `src/physics.js`, `src/explosion.js`,
`README.md`, `docs/ai-log.md`.

**Testes (Playwright, relógio virtual):**
- **Menu:** M2/M3 bloqueadas; tutorial e créditos; M pausa e Continuar
  retoma. Sem erros no console.
- **Missão 1:** setores zeram (os tiros do teste foram até as barras
  chegarem a 0) → vitória com o voo para o pátio → "FORTALEZA
  CONQUISTADA!" → "Próxima missão".
- **Missão 2:** munição 75 → 74 no 1º tiro. Parado, o tanque leva os tiros
  das torres: HP 1 → 0.8 → … → 0 → "TANQUE DESTRUÍDO — DERROTA" →
  "Tentar de novo" volta com HP e munição cheios.
- **Missão 3:** botão desbloqueado, 3 tanques e 180 s; um tiro no tanque do
  meio → 2 restantes; 180 s depois → "TEMPO ESGOTADO — DERROTA".
- **Desempenho:** menu ~58 fps; missão 3 em combate **54 fps** depois da
  otimização abaixo.

**Problemas:**
- **Missão 3 em combate a 22 fps.** Medido desligando partes: sem as
  explosões, 53 fps; sem a mira, nada mudava.
  - Causa: explosões perto da câmera (tiros no próprio tanque e no chão ao
    lado) cobrem meia tela, e o contorno do shader externo avaliava o
    efeito mais 4 vezes por pixel.
  - Correção: contorno pela derivada de tela (`fwidth`) do campo já
    calculado. O traço preto continua, com ~5× menos trabalho. Ficou
    documentado no cabeçalho de `src/explosion.js` como adaptação.
  - Por isso, e pela troca de paletas da entrada 21, o shader atual difere
    de propósito do port original comparado na entrada 17 (commit
    `add3017`).
- **Marcas de dano agressivas demais** (com 80% de vida o tanque já ficava
  quase preto) → crescimento mais gradual.
- **No teste**, rajadas iguais passavam pelos próprios buracos e não
  contavam acertos, e o portão às vezes pegava o arco acima da folha →
  mais tiros e mais espalhados no script. A lógica do jogo não mudou.
- **Não feito:** música (o pedido dizia "se tiver assets"; há só o bipe
  sintetizado do alerta de tempo).

## 24. Explosão 3D com partículas, luz dinâmica e som (Tone.js) — 05/10/2026 11:14

**Prompt:** "Explosão realista 3D com som, partículas e dynamic lighting":
- shader da explosão com cores branco → amarelo → laranja → vermelho →
  preto, turbulência Perlin 3D e 2.5 s;
- `ParticleEmitter` com pool: 60 partículas por explosão (cubos irregulares,
  esferas, octaedros deformados), 5–15 u/s, gravidade, rotação de
  360–720°/s, vida de 3–5 s;
- uma PointLight por explosão: (1.0, 0.7, 0.2), 2.0 → 0 em 2.5 s, raio 20;
- sons com Tone.js: explosão, tiro, impacto, alerta de 30 s e música
  ambiente;
- meta de 45–50 fps na missão 3.

A versão anterior, estável, foi marcada com a tag `v-estavel-missoes`.

**Feito:**
- **`src/explosion.js`.**
  - Duração de 2.5 s: o tempo do efeito do shader externo é desacelerado
    (`etime()`), e a onda de choque continua rápida.
  - Rampa de cor `fireRamp` (preto → vermelho → laranja → amarelo →
    branco) com `smoothstep` entre as paradas, no lugar da posterização.
  - O calor cai com a idade da explosão, e a fumaça vai de marrom a preto.
  - Turbulência: ruído gradiente 3D (`NOISE_WGSL`, tipo Perlin) deforma as
    coordenadas ao longo do tempo.
  - O discard e o contorno por `fwidth` (entrada 23) foram mantidos.
- **`src/explosion-particles.js` (novo).**
  - Pool fixo: nada é alocado durante o jogo.
  - 15 formas geradas uma vez:
    - 6 cubos/lascas irregulares (`buildRock`);
    - 3 esferas;
    - 6 octaedros deformados.
  - Velocidade de 5–15 em direções aleatórias da meia esfera de cima (para
    não nascerem enterradas).
  - Gravidade pelo mesmo `stepProjectile` dos tiros.
  - Rotação em eixo aleatório (`mat4.rotationAxis`, Rodrigues, novo em
    `math.js`).
  - Um quique no chão e depois param.
  - Alpha de 1 a 0 na vida de 3–5 s (pipeline com alpha-to-coverage).
  - Cores azul / verde / vermelho / rosa (castelo, hera, flores); nos
    acertos no tanque as lascas são metálicas.
  - Substitui o sistema de lascas antigo.
- **Luz dinâmica (`src/lighting.js`).**
  - O uniform da cena ganhou um array de 4 luzes pontuais (posição e
    intensidade).
  - `shadeFull` soma a contribuição de cada uma em tudo que usa a
    iluminação completa (castelo, chão, tanques, árvores, partículas).
  - Intensidade: 2.0 × (1 − idade/2.5), mais um clarão de 0.12 s no início
    (o antigo "flash").
- **Som (`src/explosion-sound.js`, novo).**
  - Explosão: ruído marrom com envelope → passa-baixa de 1 kHz, mais um
    "boom" G2 com pitch descendente; o volume cai com a distância à
    câmera.
  - Tiro: dente-de-serra D5. Impacto no tanque: batida A2. Alerta dos
    30 s: bip quadrado C6 duas vezes (substitui o bip WebAudio antigo).
  - Música: PolySynth triângulo em loop (C – G – Am – Em, 60 BPM, −24 dB).
  - Liga no primeiro clique/tecla (exigência do navegador); a tecla **N**
    liga/desliga a música.
  - Crédito do Tone.js (MIT) no README e na tela de créditos.

**Diferenças em relação ao pedido (adaptações ao projeto):**
- O exemplo usava three.js (`THREE.PointLight`, classe `Game`). O projeto
  é WebGPU puro, então a luz pontual foi feita no shader WGSL, sem sombra
  (como pedido para desempenho).
- `import * as Tone from` cdnjs não funciona: o arquivo é UMD, não módulo
  ES. Tone.js é carregado por `<script>` de uma cópia local
  (`assets/vendor/Tone.js`), o que também garante funcionar sem internet
  na apresentação.
- O exemplo criava um sintetizador novo a cada som. Os instrumentos são
  criados uma vez e reaproveitados, para não acumular nós de áudio.
  Explosões simultâneas (< 60 ms) tocam um som só.
- Atenuação `I / (1 + d²)` com d medido em unidades de 3 m. Com d em
  metros a luz sumia a 2–3 m e não se via na parede. Há um corte suave
  entre 14 e 20 (raio 20).
- As partículas usam a meia esfera de cima, não "todas as direções": as de
  baixo nasceriam dentro do chão.

**Arquivos:** `src/explosion.js`, `src/explosion-particles.js` (novo),
`src/explosion-sound.js` (novo), `assets/vendor/Tone.js` (novo),
`src/lighting.js`, `src/math.js`, `src/main.js`, `index.html`,
`README.md`, `docs/ai-log.md`.

**Testes (Playwright, Chrome com GPU):**
- **Missão 1:** tiros no portão → explosão com fogo, partículas e luz
  (capturas de tela); o portão cai após 3 acertos. `window.Tone` carregado
  e o contexto de áudio em "running" após o clique. Sem erros de shader
  nem no console (só o 404 do favicon).
- **Missão 3 em combate**, tiro a cada 0.3 s com as torres e os tanques
  atirando de volta: **53 fps** (meta 45–50; antes desta entrada eram 54).
  Sem erros.
- O som em si não dá para ouvir no teste automatizado: foi verificado que
  inicializa e toca sem exceções.

**Problemas:**
- A troca da assinatura de `sceneUniformData` (agora recebe uma lista de
  luzes) quebrava `main.js` até a integração, que foi feita junto.
- O script de regressão completo (`missions_check.py`) falhou ao imprimir
  "∞" no console do Windows (cp1252). É um problema do script, não do
  jogo. A nova execução foi interrompida pelo usuário, e a verificação
  ficou com o teste de fumaça e o de desempenho da missão 3.

## 25. feat: explosion shader realistic colors (white → yellow → orange → red → black) with 3D Perlin turbulence — 05/10/2026 11:26

**Prompt:** "Melhoria final do shader", só em `src/explosion.js`:
- `EXPLOSION_DURATION` de 1.3 para 2.5;
- cor em 5 fases pelo tempo com `mix` (código WGSL de exemplo):
  1. branco intenso;
  2. amarelo;
  3. laranja;
  4. vermelho escuro;
  5. fumaça preta;
- aumentar a frequência / as oitavas do fbm/Perlin para mais turbulência.

**Feito:**
- **Duração:** já estava em 2.5 s desde a entrada 24. Nada mudou.
- **`phaseColor(t)`:** as 5 fases com as cores e os limites exatos do
  pedido (0.2 / 0.4 / 0.6 / 0.8), com `mix` dentro de cada fase. Substitui
  `fireRamp` e `posterize`, removidas por não terem mais uso.
  - **Bola de fogo:** usa a fase atual, com o núcleo um pouco "mais novo"
    (mais quente) que a borda, para não ficar uma cor chapada.
  - **Fumaça:** também leva a cor da fase, um pouco adiantada e a 60%,
    e termina cinza-preta (0.1).
- **Turbulência:** não havia `fbm` nem `octaves` para ajustar (era 1
  oitava do gradient noise 3D). Foi criada `fbm()` com
  `TURB_FREQUENCY = 1.4` (o dobro do 0.7 anterior) e `TURB_OCTAVES = 2`,
  deslocamento de 0.45 para 0.8 e animação mais rápida.

**Arquivos:** `src/explosion.js`, `docs/ai-log.md`.

**Testes (Playwright, Chrome com GPU):**
- **Visual:** capturas de tela a cada ~0.4 s após o impacto no portão.
  Branco/amarelo → laranja → vermelho escuro → fumaça escura → some.
  Sem erros de shader nem no console.
- **Desempenho (missão 3 em combate):** novo shader ~41 fps, anterior
  ~41 fps, medidos alternando as versões duas vezes. A máquina estava mais
  lenta que na medição de 53 fps da entrada 24. O custo extra ficou dentro
  do ruído da medição.

**Problemas:**
- **Primeira versão (cor só pela fase na bola de fogo):** as fases laranja
  e vermelha quase não apareciam.
  - Causa: a bola de fogo do efeito original some na metade da vida, e a
    fumaça (marrom fixa) dominava.
  - Correção: a fumaça também passou a seguir a cor da fase.
- **fBm com 3 oitavas nos dois eixos (6 ruídos por pixel):** derrubou a
  missão 3 de ~41 para ~34–36 fps.
  - A explosão é o fragment shader mais caro do jogo (entrada 23).
  - Reduzido para 2 oitavas no eixo x e 1 no y (3 ruídos por pixel). O
    custo ficou igual ao anterior.
  - Por isso não foram usadas as "6 oitavas" do pedido.
- **Medições de fps variando muito entre execuções** (53 → 43 na mesma
  versão). A comparação justa foi feita alternando as versões antiga e
  nova, com `git stash`.

## 26. Slides HTML interativos com os 6 critérios de avaliação — 05/10/2026 11:50

**Prompt:** criar `src/presentation.html` com 10 slides:
1. capa;
2. objetivo;
3. registro de IAs (2,5);
4. erros e correções (2,5);
5. comparação entre IAs (2,0);
6. origem do shader (1,0);
7. app estável (1,5);
8. clareza (0,5);
9. resumo dos pontos;
10. créditos.

Tema escuro azul/amarelo/laranja, navegação por setas e clique, botões
"Ver ao vivo" e "Ver ai-log.md", e impressão em PDF.

**Feito:**
- **`src/presentation.html`:** um arquivo só, sem bibliotecas (fonte Inter
  do Google Fonts, com fonte do sistema se estiver sem internet).
  - **Palco 16:9** com transição suave (fade + deslize).
  - **Navegação:**
    - setas, PageUp/PageDown, Home/End;
    - clique no slide (no quarto esquerdo, volta);
    - botões Início / Anterior / Próximo / Ver ao vivo;
    - contador e barra de progresso;
    - `#n` na URL para abrir direto num slide.
  - **Impressão:** `@media print` com um slide por página (testado:
    PDF de 10 páginas).
  - **Celular:** em tela estreita, cada slide vira uma coluna com
    rolagem.
  - **Contador de entradas:** lê o próprio `docs/ai-log.md`, então fica
    certo conforme o log cresce.
- **`assets/slides/`:** capturas reais do jogo (castelo ao pôr do sol para
  a capa, missão 1 com explosão, missão 3 em combate, quadros das fases da
  explosão).
- **`serve.py`:** `.md` servido como `text/plain`. Antes saía como
  `application/octet-stream`, e os botões "Ver ai-log.md" baixavam o
  arquivo em vez de abrir.
- **README:** seção "Apresentação" com o endereço dos slides.

**Conteúdo conferido com a documentação (corrigido onde o pedido não
batia):**
- **Slide 3 (entradas de exemplo):**
  - A entrada 1 não foi "Setup WebGPU": foi organizar o protótipo em
    módulos, git e README.
  - A entrada 6 é linha de mira + trincheira, não refatoração; acabou
    tirada da tabela, por espaço.
  - Usadas as entradas reais 1, 3, 17, 23, 24 e 25.
- **Slide 4 (erros):** três dos cinco exemplos do pedido não estão no
  log e foram trocados por casos documentados:
  - "`target` → `camLookAt`": `camLookAt` já existia no protótipo
    original (commit `696a5ca`), não foi correção de bug.
  - "buffer de 96 vs 112 bytes": o buffer do Claude sempre foi de 112. O
    erro de alinhamento real foi o da resposta do Gemini (192 vs 208,
    entrada 17), citado no rodapé do slide.
  - "inércia na entrada 19": a inércia foi um recurso pedido na
    entrada 23, não correção; a entrada 19 foi o cache do navegador.
  - Os 5 casos do slide:
    1. paleta fora do array e divisão por zero (3);
    2. tiro no "fundo" do buraco (8);
    3. cache e servidor duplicado (19);
    4. 22 → 54 fps (entrada 23, não 24);
    5. cores da explosão (25).
- **Slide 6:**
  - O autor "gafurov" não aparece em nenhuma fonte do projeto. A página
    do godotshaders credita a versão Godot a "RayL019" e não diz o nome
    do autor do Shadertoy, por isso o slide usa só o que dá para
    verificar.
  - A validação ≤ 0,03% vale para o port original, antes das mudanças
    visuais, e o slide diz isso.
- **Slide 8:** `DEVELOPMENT_REPORT.md` não existe no repositório e ficou
  de fora.
- **Slide 9:** em vez de "10/10", que seria a nota (cabe ao professor), a
  tabela mostra peso, onde está a evidência e "6 de 6 critérios
  cobertos".
- **Nomes do grupo e do professor:** marcados com `<!-- EDITAR -->` no
  HTML. O prompt só trazia "Giulia + grupo".

**Arquivos:** `src/presentation.html` (novo), `assets/slides/*` (novo),
`serve.py`, `README.md`, `docs/ai-log.md`.

**Testes (Playwright, Chrome):**
- **Desktop (1366×768):** os 10 slides navegados pelo teclado,
  verificando automaticamente que nada passa da borda e que nenhuma imagem
  quebra. Capturas conferidas.
- **Celular (390 px):** sem rolagem horizontal.
- **Links:** `ai-log.md`, `analise-ias.md`, `README.md`, `CLAUDE.md` e o
  jogo respondem 200 e abrem no navegador.
- **PDF:** 10 páginas.
- Sem erros de JavaScript (só o 404 do favicon).

**Problemas:**
- **Primeira versão:** no slide 3 a tabela passava por cima do botão, e
  o slide 2 vazava 9 px → tabela mais compacta (uma linha a menos) e
  textos menores.
- **No celular** o slide 16:9 cortava o conteúdo → layout de uma coluna
  com rolagem.
- **Download dos `.md`** em vez de abrir → tipo corrigido no `serve.py`
  (servidor reiniciado).

## 27. Relatório técnico final (docs/DEVELOPMENT_REPORT.md) — 05/10/2026 11:56

**Prompt:** criar `docs/DEVELOPMENT_REPORT.md`. O texto trazia a seção
1 completa (resumo executivo: projeto, estudante, curso, data, status,
objetivo, escopo) e **terminava no título "### 2. ARQUITETURA DO
PROJETO"**: o prompt chegou cortado.

**Feito:**
- **Seção 1:** mantida como enviada, mais os números do projeto.
- **Seções 2–14 escritas a partir do código e do log:**
  - arquitetura (módulos e loop do quadro);
  - pipeline de renderização (bind groups, pipelines, técnicas);
  - shader externo (fonte, 10 adaptações, validação);
  - partículas, luz dinâmica e som;
  - jogabilidade (tabela das missões tirada de `missions.js`);
  - histórico de desempenho e testes;
  - uso de IA, com a tabela de problemas e correções;
  - limitações conhecidas, como rodar e créditos.
- **Slides:** o critério 6 ganhou o link para o relatório. Ele tinha sido
  tirado na entrada 26 porque o arquivo não existia. O contador de commits
  passou para 27.
- **README:** o relatório entrou na estrutura de arquivos.

**Arquivos:** `docs/DEVELOPMENT_REPORT.md` (novo), `src/presentation.html`,
`README.md`, `docs/ai-log.md`.

**Problemas:**
- **Prompt incompleto** → as seções seguintes foram escritas sem
  especificação; podem ser ajustadas se vier o resto.
- **Duas afirmações do 1º rascunho estavam erradas** e foram corrigidas
  conferindo o código:
  - "19 módulos" → são 18 (`ls src/*.js`);
  - "colisão em 9 pontos" → são 38 (19 posições × 2 alturas,
    `TANK_SAMPLES` / `TANK_HEIGHTS` em `trench.js`).
- **Limitação registrada no relatório:** o roteiro completo das missões
  não foi reexecutado até o fim depois das entradas 24–26.

## 28. Menu épico, transições entre missões e ranking — 05/10/2026 12:17

**Prompt:** "polish final" do menu e do fluxo:
- menu com título pulsando, câmera girando, poeira, pôr do sol mais
  dramático e música; botões Começar / M2 / M3 (bloqueados, com aviso) /
  Tutorial (3 linhas) / Créditos (shader, IAs, professora) / Scores / Sair;
- briefing por missão com espera de 3 s (Espaço começa);
- transições com fade 1,5 s / 0,5 s, e vitória → próxima missão
  automática;
- ranking com estatísticas, pontuação e rank, recordes em
  `mission_N_best_score`, tela de scores e derrota com motivo e
  progresso;
- confete e sons de vitória, derrota, carregamento e ding.

O pedido dizia "entrada 27", que já era o relatório técnico, então esta é a
28. A versão anterior, estável, foi marcada com a tag
`v-estavel-relatorio`.

**Feito:**
- **`src/scores.js` (novo):**
  - **Pontos:** Velocidade, Munição e Integridade, de 0 a 1000 cada.
    - Velocidade: pelo tempo de referência `parTime` da missão.
    - Munição: tiros mínimos (2 × acertos por setor + portão + tanques) ÷
      tiros disparados.
    - Integridade: saúde restante.
  - **Rank:** Excelente ≥ 90%, Ótimo ≥ 75%, Bom ≥ 55%, Regular.
  - **Recordes:** só são gravados quando superam o anterior, em
    `localStorage`, com try/catch.
- **`src/missions.js`:** dificuldade, `parTime` (90 / 120 / 150 s) e
  objetivos de cada missão.
- **`src/menu.js` (reescrito):**
  - telas novas: briefing, seleção de missão e scores;
  - o briefing libera o botão após 3 s; Espaço começa e Esc volta;
  - "Desbloqueado após M1/M2" nos botões travados;
  - transição com tela preta (`#fader`): 1,5 s escurecendo → troca →
    0,5 s clareando, bloqueando cliques duplos no meio;
  - Sair tenta `window.close()`. O navegador só deixa fechar abas abertas
    por script, então aparece um aviso para fechar com Ctrl+W.
- **`index.html`:**
  - título entra de 1,2× para 1,0× e depois "respira" (1,0 ↔ 1,04);
  - hover dos botões com scale 1,05 e mudança de cor;
  - telas entram com fade de 0,5 s;
  - tutorial em 3 linhas;
  - créditos com as IAs e a professora.
- **`src/main.js`:**
  - **Câmera do menu:** se aproxima do castelo durante o fade de saída.
  - **Poeira:** 70 esferinhas brancas emissivas flutuando no anel da
    câmera, só no menu. Usam o mesmo pipeline das partículas.
  - **Vitória:**
    - som de acorde maior;
    - confete: 4 rajadas de partículas coloridas, mais lentas
      (`speedScale` novo no `emit`);
    - tela de ranking com Próxima / Novo jogo / Menu. Na última missão:
      campanha completa e soma dos recordes.
  - **Derrota:** "MISSÃO FALHADA", com motivo, integridade de cada setor,
    tempo restante (M3) e acorde menor.
- **`src/explosion-sound.js`:** `playLoading` (arpejo), `playVictory`
  (Dó maior), `playDefeat` (Lá menor) e `playDing`.

**Não feito / adaptado:**
- **"Pôr do sol mais dramático, sombras longas":** não mexi. O sol é
  fixo no shadow map, calculado uma vez, e mudar a direção dele no dia da
  apresentação arriscaria o visual de tudo (castelo, sombras, buracos).
- **Música no menu:** já tocava desde a entrada 24, mas o navegador só
  libera áudio depois do 1º clique ou tecla, então ela não toca na
  abertura da página.
- **"Ranking com [PRÓXIMA]" × "próxima missão começa sozinha":** os dois
  ficaram. A tela de ranking aparece, e "Próxima" leva ao briefing
  seguinte, que começa sozinho em 3 s.
- **Nome da professora:** marcado com `<!-- EDITAR -->` nos créditos (não
  veio no prompt).

**Arquivos:** `src/scores.js` (novo), `src/menu.js`, `src/missions.js`,
`src/main.js`, `src/explosion-sound.js`, `src/explosion-particles.js`,
`index.html`, `src/presentation.html`, `README.md`,
`docs/DEVELOPMENT_REPORT.md`, `docs/ai-log.md`.

**Testes:**
- **Unitário (Node):**
  - pontuação perfeita = 3000 (Excelente);
  - casos intermediários conferidos;
  - recorde só sobrescreve se maior;
  - limpar apaga.
- **Fluxo completo (Playwright, Chrome com GPU):**
  - **Menu e briefing:**
    - M2/M3 travadas com o aviso; Sair mostra o aviso;
    - Scores vazio → Esc volta;
    - briefing M1: botão travado e Espaço ignorado antes de 3 s,
      liberado depois;
    - Espaço → fade (opacidade 0,9 no meio) → missão rodando.
  - **Vitória na M1:** ranking "MISSÃO 1 CONCLUÍDA!", 2404 pts, Ótimo
    (80%), NOVO RECORDE, gravado no `localStorage`. "Próxima" → briefing
    M2 "Começando em 3…" → começou sozinho.
  - **Derrota na M2:** "MISSÃO FALHADA — Razão: TANQUE DESTRUÍDO", com
    progresso. "Escolher" → seleção (M1 com recorde, M3 travada).
  - **Depois:** Scores mostra o recorde da M1; M pausa e retoma.
  - Sem erros de JavaScript.
- **Tempo real:**
  - câmera aproximando no fade;
  - confete visível no pátio;
  - poeira no menu;
  - título numa linha só (na 1ª versão quebrava em duas; corrigido).
- **Desempenho (missão 3 em combate),** alternando as versões na mesma
  sessão: nova 30–35 fps, anterior 21–25 fps. Sem perda: a máquina
  inteira estava mais lenta nesse momento (antes dava ~41).

**Problemas:**
- **Título quebrava em duas linhas** (largura máxima da tela de 600 px) →
  `nowrap` no menu.
- **Confete saía do quadro:** a rajada usava a velocidade das explosões
  (5–15 u/s) → `speedScale` 0,45.
- **No teste com relógio virtual,** o confete (setTimeout real) e os
  quadros (simulados) não ficavam sincronizados → conferido num teste em
  tempo real.
- **Os scripts de teste antigos** clicavam direto no botão da missão:
  `perf24.py` foi ajustado para o briefing, e `missions_check.py` foi
  substituído pelo teste de fluxo novo.

## 29. Nome do professor nos créditos — 05/10/2026 12:25

**Prompt:** trocar o marcador do nome nos créditos do jogo (`index.html`) e
no slide 10 (`src/presentation.html`) por "Professor: Adriano Felix
Valente", testar as duas telas e commitar.

**Feito:**
- **`index.html`, créditos do jogo:** "Professora: [nome da professora]"
  → "Professor: Adriano Felix Valente — Computação Gráfica, FECAP". O
  comentário `<!-- EDITAR -->` desse trecho foi removido.
- **`src/presentation.html`, slide 10:** "Professor(a): [nome]" →
  "Professor: Adriano Felix Valente". O comentário ficou só para os
  nomes do grupo, que continuam como "Giulia e grupo".
- O HTML real era um pouco diferente do trecho do pedido (`<div>` e
  `<li>`, não `<p>`). A estrutura existente foi mantida e só o texto foi
  trocado.

**Arquivos:** `index.html`, `src/presentation.html`, `docs/ai-log.md`.

**Testes (Playwright, Chrome):**
- Créditos do jogo: "Professor: Adriano Felix Valente — Computação
  Gráfica, FECAP."
- Slide 10/10: "Professor: Adriano Felix Valente".
- Sem erros de JavaScript.

**Problemas:** nenhum.

## 30. README para o GitHub + publicação do repositório — 05/10/2026 14:26

**Prompt:** atualizar o README com um modelo dado e publicar no GitHub
(`GiuNogueiraSa/fortress-assault`):
- remote `origin`;
- `git push -u origin main`;
- `git push origin --tags`.

A primeira versão do prompt (interrompida) trazia `SEU_GITHUB_USER` e um
e-mail de exemplo; a segunda trouxe o usuário e o repositório.

**Verificações antes de publicar:**
- **Git local:** 29 commits, 5 tags `v-estavel-*`, árvore limpa, sem
  remote. O `user.name` (GiuNogueiraSa) já estava configurado, então nada
  mudou na configuração.
- **Dados pessoais:** procura por e-mail, caminhos da pasta do usuário do
  Windows, senhas e tokens nos 37 arquivos versionados. Nada encontrado (a
  única ocorrência é "unexpected token", uma mensagem de compilador citada
  no log).
- **Repositório no GitHub:** já existia, público e vazio (`git ls-remote`
  sem refs; API 200). Não precisou ser criado. O `gh` CLI não está
  instalado, então não daria para criar por aqui.
- **Licenças para repositório público:** shader CC BY-NC-SA 3.0 (não
  comercial, com atribuição), modelo CC BY 4.0 (atribuição), Tone.js MIT.
  A atribuição está no README.

**README — o modelo foi seguido, com correções para não publicar
informação errada:**
- "Como rodar" usa `python serve.py`; o `http.server` aparece como
  alternativa, com o aviso de cache (entrada 19).
- "28 entradas" → 30.
- "18 módulos" → 19 (`scores.js` entrou na entrada 28).
- "Som — 5 faixas" → a lista real de sons.
- **Desempenho:** "Missão 1: 58 fps / Missão 2: 54 fps" não foram medidos.
  Ficaram só os números medidos: menu ~58 fps; missão 3 em combate 41–54
  fps, ou 30–35 com a máquina lenta.
- **Tabela de critérios:** ganhou a coluna "Evidência".
- **Seções mantidas,** que o modelo removia: Controles, Estrutura e
  **Créditos e licenças**. A atribuição é exigida pelas licenças CC BY do
  modelo e do shader.
- "[Nomes do grupo]" ficou como no modelo.

**Arquivos:** `README.md`, `docs/ai-log.md`.

**Problemas:** o 1º script que escrevia esta entrada não rodou. Um `\U` no
texto foi lido pelo Python como escape de caractere Unicode, e nada foi
gravado nem commitado. Refeito sem a barra.

## 31. Ideias para deixar o jogo mais legal — 05/10/2026 14:30

**Prompt:** "tem algo que poderíamos melhorar nesse jogo para ele ser mais
legal? tipo, dependendo da quantidade de disparos o buraco aumenta?"

**Feito:** só análise e sugestões, sem mudança de código.
- **Viabilidade da ideia do buraco crescente:** lido o `addHole` em
  `src/trench.js`. Hoje cada acerto cria um buraco novo (raio 0,4–0,8, até
  96 buracos).
  - Crescer seria: se o impacto cair dentro de um buraco existente, aumentar
    o raio dele em vez de criar outro.
  - A colisão e o recorte no shader leem os mesmos dados, então o tanque já
    passaria pelo buraco maior sem mudança extra.
  - De quebra, economiza vagas do limite de 96.
- **Outras ideias listadas,** por custo e risco:
  - câmera lenta no tiro final;
  - vento afetando a trajetória;
  - munição pesada;
  - crateras no chão;
  - desabamento de torre ao zerar um setor.
- **Recomendação:** só mudanças pequenas e isoladas hoje (dia da
  apresentação), com a tag de versão estável para voltar.

**Arquivos:** `docs/ai-log.md`.

## 32. Buraco que cresce, crateras no chão e torre que desmorona — 05/10/2026 15:02

**Prompt:** "faça a minha ideia [buraco que aumenta com os disparos] e isso
também: crateras no chão quando o tiro erra e torre desmorona quando o setor
zera".

A versão anterior, estável, foi marcada com a tag `v-estavel-readme`.

**Feito:**
- **Buraco que cresce (`src/trench.js`, `addHole`):**
  - Um tiro na borda de um buraco existente aumenta esse buraco em vez de
    abrir outro. "Borda" é até 1,5× o raio (+0,25) do eixo, na mesma
    direção de tiro.
  - O raio cresce 0,32 por acerto, até 2,0, e o centro anda 25% para o
    lado do impacto.
  - O recorte no shader e a colisão do tanque usam os mesmos dados, então a
    brecha maior também deixa o tanque passar.
  - O status mostra "O buraco aumentou!".
- **Crateras (`src/lighting.js`, shader do chão):**
  - O uniform da cena ganhou as últimas 12 crateras (centro, raio, força).
  - O shader desenha fuligem escura no centro e um anel de terra revirada,
    com borda irregular por ruído, e inclina a normal para dentro do buraco
    e para fora no anel: com a luz do sol, parece afundado.
  - O tiro do jogador que erra agora também gera uma explosão menor, com
    partículas de terra e grama, tremor e som. Antes só mudava o texto do
    status.
  - Os tiros inimigos no chão deixam crateras menores.
  - Crateras debaixo do castelo são ignoradas, porque não aparecem.
- **Torre que desmorona (`trench.js` + `lighting.js` + `main.js`):**
  - Quando o setor esquerdo ou direito zera, a torre dele desaba.
  - **Visual:** o fragment shader do castelo (cor e sombra) descarta tudo
    dentro do raio da torre (+0,5) acima de uma altura de corte. A borda é
    irregular, com ruído pelo ângulo, e queimada como a dos buracos.
  - **Uniform:** a altura do corte vai nas duas vagas livres do cabeçalho do
    uniform dos buracos (`count.y` / `count.z`). Assim nenhum layout de bind
    group mudou.
  - **Queda:** a altura desce de 14,6 para 5,2 em 1,6 s, de forma quadrática
    (acelera, como uma queda), com 3 explosões na borda que desce e tremor
    contínuo.
  - **Pedaços:** ~22 pedaços grandes (0,3–0,75) saem da borda, caem com
    gravidade girando e viram entulho parado ao tocar o chão. No fim, um
    monte de 12 pedras se forma na base.
  - **Colisão:** usa o mesmo corte. O tiro passa onde a torre não existe
    mais, e a base continua sólida.
  - Aviso "TORRE DESMORONOU!".

**Arquivos:** `src/trench.js`, `src/lighting.js`, `src/main.js`,
`README.md`, `docs/DEVELOPMENT_REPORT.md`, `src/presentation.html`,
`docs/ai-log.md`.

**Testes (Playwright, Chrome com GPU, relógio virtual):**
- **Shaders:** compilam ("WebGPU ativo", sem erro de GPU).
- **Cratera:** tiro baixo → "Impacto no chão", e a captura mostra a cratera
  escura com o anel de terra.
- **Buraco que cresce:** ao zerar o setor esquerdo, apareceu "O buraco
  aumentou!" nos tiros que pegaram a borda. Tiros idênticos ao 1º passam
  pelo próprio buraco e caem no chão, o que é esperado.
- **Desabamento:**
  - corte 14,6 → 14,0 → 12,5 → 10,1 → 5,2 ao longo de 1,6 s;
  - capturas com uma câmera de teste (injetada só no teste) mostram o topo
    sumindo com explosões e pedaços, e no fim o toco e a brecha na muralha;
  - colisão: o alto da torre esquerda deixou de ser sólido; a base e a
    torre direita continuam sólidas.
- **Regressão (teste de fluxo da entrada 28):** igual ao anterior.
  - Vitória na M1 com ranking.
  - M2 começa sozinha.
  - Derrota, Escolher, Scores e pausa funcionam.
  - Sem erros.
- **Desempenho (missão 3 em combate),** alternando as versões: nova
  35,6–35,9 fps, anterior 34,5–35,1 fps. Sem perda.

**Problemas:**
- **O jogo não carregava** ("Cannot access 'TOWERS_WGSL' before
  initialization"): o código WGSL dos buracos passou a usar as constantes
  das torres, declaradas mais abaixo no arquivo JS. A declaração foi movida
  para antes.
- **No 1º teste, a câmera normal** (atrás do tanque) cortava o topo das
  torres e não dava para ver a queda → câmera de teste afastada, só no
  script.

## 33. "O jogo está testado?" — 05/10/2026 15:42

**Prompt:** pergunta se o jogo está testado.

**Feito:** levantamento, sem mudança de código, do que foi verificado e do
que não foi.
- **Testado (automático, no Chrome com GPU):** compilação dos shaders, o
  fluxo da entrada 28 (vitória na M1, ranking, M2 começando sozinha, derrota
  na M2, seleção, scores, pausa), os recursos da entrada 32 e o desempenho
  da M3.
- **Não testado:**
  - vitória na M2 e na M3, incluindo a tela final da campanha;
  - desabamento nas escalas da M2/M3;
  - alerta de 30 s com Tone.js;
  - som ouvido de verdade;
  - partida jogada por uma pessoa.

**Arquivos:** `docs/ai-log.md`.

## 34. Teste das vitórias nas missões 2 e 3 e do alerta de 30 s — 05/10/2026 15:56

**Prompt:** "sim" (rodar o teste automático das missões 2 e 3 sugerido na
entrada 33).

**Feito:** teste Playwright (Chrome com GPU, relógio virtual), sem mudança
no código do jogo.
- **Ajustes só no teste,** para conseguir vencer:
  - "modo deus", que ignora o dano no tanque do jogador; o dano e a derrota
    já tinham sido testados na entrada 28;
  - câmera de teste para as capturas.
  - Os dois foram injetados interceptando o `main.js` no navegador.
- **Missão 2:** vitória com 26 de 75 tiros.
  - A torre esquerda desabou na escala 1,12: o alto deixou de ser sólido e
    a base continuou sólida.
  - Ranking "MISSÃO 2 CONCLUÍDA!", 2962 pts, Excelente.
  - A M3 foi desbloqueada.
- **Missão 3:** a partir de "Próxima", o briefing começou sozinho.
  - Os 3 tanques inimigos foram destruídos e o castelo caiu com 34 tiros
    (63 de 100 sobrando).
  - Tela final "VOCÊ É O CONQUISTADOR!", com Inimigos 3/3, 2892 pts,
    Excelente (96%), NOVO RECORDE e "Campanha completa! Soma dos recordes:
    5854 / 9000 pts".
  - Botões Novo jogo / Menu. Scores mostra os recordes da M2 e da M3; a M1
    aparece vazia porque o teste começa com o armazenamento limpo.
- **Alerta de 30 s (M3):** o aviso "30 SEGUNDOS!" aparece quando o tempo
  chega a 30 s, o cronômetro fica vermelho e o Tone.js fica em "running".
- Sem erros de JavaScript.

**Problemas (todos no script de teste, não no jogo):**
- **1ª execução da M3:** a munição acabou com os setores em 8%. O script
  atirava numa grade fixa, e muitos tiros passavam pelos buracos já
  abertos. Ele passou a mirar só em pontos da fachada que ainda são parede,
  como um jogador faria. A tela de derrota "MUNIÇÃO ACABOU" funcionou
  corretamente nesse caso.
- **Teste de "parede sólida" errado:** o ponto ficava na frente da fachada,
  e o portão fica no meio da passagem → corrigido.
- **Alerta de 30 s não detectado:** o teste pulava 4 s por vez, e o aviso
  dura 1,6 s → passos menores perto dos 30 s.
- **Avisos "Max polyphony exceeded" do Tone.js:** só no teste de alerta.
  Para pular 149 s de jogo, o script trava o navegador por alguns segundos,
  e o Tone toca de uma vez os acordes de música atrasados. Isso não
  acontece jogando normalmente, nem apareceu nos testes em tempo normal.

**Arquivos:** `docs/ai-log.md`.

## 35. Mira no mouse em vez das setas? — 05/10/2026 17:11

**Prompt:** "podemos colocar a mira no mouse em vez das setas do teclado?
Assim o jogador controla as duas coisas num lugar só. O que você
recomenda?" Depois veio uma mensagem curta, "é rpe", que não deu para
entender.

**Feito:** análise e recomendação, sem mudança de código.
- **Como está hoje:** o mouse (X e Y) gira a câmera em volta do tanque, as
  setas ↑/↓ mudam a elevação do cano, e a torre segue o corpo (um único
  `state.yaw`, com A/D).
- **Opção A (recomendada para hoje):**
  - mouse Y controla a elevação do cano, e a câmera inclina junto;
  - mouse X continua girando a câmera;
  - as setas continuam como ajuste fino.
  - A mudança fica no `mousemove`: risco baixo.
- **Opção B (estilo World of Tanks, para depois):** a torre segue a
  direção da câmera, independente do corpo. Exige um yaw próprio para a
  torre, no disparo, na linha de mira e nas matrizes do tanque: risco
  maior no dia da apresentação.

**Arquivos:** `docs/ai-log.md`.

## 36. Mira no mouse com torre independente (opção B) — 05/10/2026 17:37

**Prompt:** "opção b": a torre gira para onde o mouse aponta, independente
do corpo (estilo World of Tanks).

A versão anterior, estável, foi marcada com a tag `v-estavel-testes`.

**Feito:**
- **`src/tank.js`:**
  - **Torre separada do corpo:** o loader do glTF já classificava as peças
    (632 triângulos de "torre", acima de y = 140 no modelo), mas juntava
    tudo no corpo. Agora a torre vira uma malha própria, centrada no meio
    da caixa que a envolve.
  - **Cano:** o pivô do cano passou a ser relativo à torre.
  - **`tankModelMatrices`:** aplica a rotação da torre em relação ao corpo
    (`turretYaw − yaw`). Sem `turretYaw`, como nos tanques inimigos, a
    torre olha para a frente.
- **`src/main.js`:**
  - **Estado:** `aimYaw` (para onde o jogador mira, no mundo) e `turretYaw`
    (para onde a torre aponta).
  - **Mouse travado:** X gira `aimYaw` e Y muda a elevação do cano.
  - **Torre:** gira até `aimYaw` a 2 rad/s (~115°/s), pelo caminho mais
    curto.
  - **Câmera:** fica atrás da mira, e não mais do corpo. A inclinação
    acompanha um pouco o cano (cano alto → câmera mais baixa, para ver
    longe).
  - **Teclado:** Q/E giram a mira (para quem não trava o mouse ou usa
    touchpad), e as setas ↑/↓ continuam como ajuste fino do cano.
  - O tiro e a linha de mira já usavam `tankModelMatrices`, então seguem
    a torre sem mudança.
- **`src/hud.js`:** o minimapa ganhou um traço mostrando para onde a torre
  aponta.
- **Textos:** dica do HUD, briefing, tutorial, README, relatório e slides.

**Arquivos:** `src/tank.js`, `src/main.js`, `src/hud.js`, `index.html`,
`README.md`, `docs/DEVELOPMENT_REPORT.md`, `src/presentation.html`,
`docs/ai-log.md`.

**Testes (Playwright, Chrome com GPU, relógio virtual):**
- **Torre:**
  - mira 90° à esquerda → a torre gira 0,48 rad em 0,25 s (limite de
    2 rad/s) e para exatamente em 1,571;
  - o tiro sai na direção da torre: (−1, 0), como esperado.
- **Corpo:** girar com D → o corpo foi a −1,44 e a mira e a torre ficaram
  em 1,571.
- **Q/E:** E por 0,5 s → mira −0,62; Q volta.
- **Mouse de verdade com o ponteiro travado:** 100 px para a esquerda →
  mira +0,30; 50 px para cima → cano 0,35 → 0,46.
- **Capturas:** com a torre virada e o corpo girado, nenhuma peça do modelo
  ficou para trás.
- **Regressão** (scripts ajustados para também definir a direção da mira):
  - fluxo completo: vitória na M1, ranking, M2 automática, derrota,
    Escolher, pausa;
  - vitórias na M2 e na M3, com torres desabando e a tela "VOCÊ É O
    CONQUISTADOR!".
  - Sem erros.
- **Textos novos** do briefing e da barra de dicas cabem na tela (uma
  linha).

**Problemas:** nenhum no jogo. Os scripts de teste posicionavam o tanque só
com `yaw`, e a torre ficaria apontando para a mira antiga → passaram a
definir `aimYaw` / `turretYaw` também.

## 37. GitHub atualizado? GitHub Pages? Ajustes nos slides — 05/10/2026 17:41

**Prompt:** "subiu tudo para o GitHub? Consigo acessar o jogo pelo GitHub
Pages? É preciso alterar algo no documento da apresentação?"

**Verificado:**
- **GitHub:** 6 commits locais ainda não enviados (entradas 31 a 36) e 2
  tags novas (`v-estavel-readme`, `v-estavel-testes`).
- **GitHub Pages:** o jogo é um site estático, com todos os caminhos
  relativos (nenhum começa com `/`), e o Pages usa HTTPS, que o WebGPU
  exige. Então funciona em `giunogueirasa.github.io/fortress-assault`, desde
  que o Pages seja ativado nas configurações do repositório.
- **Slides:**
  - o contador de commits estava em 32;
  - faltavam os links do repositório e do jogo online;
  - os nomes do grupo ainda estão como "Giulia e grupo".

**Feito:**
- **`.nojekyll` (novo, vazio):** sem ele, o Pages processa o site com o
  Jekyll, que transforma os `.md` em páginas e pode quebrar com os `{ }`
  dos logs. Com ele, os arquivos são servidos como estão.
- **`src/presentation.html`:**
  - contador "35+ commits";
  - links do repositório e do jogo online no critério 6;
  - quando aberto no `github.io`, os links para `.md` (ai-log, análise,
    README, CLAUDE) apontam para o GitHub, que os mostra formatados, em vez
    do texto cru.
- **README:** link "Online" para o GitHub Pages.

**Arquivos:** `.nojekyll`, `src/presentation.html`, `README.md`,
`docs/ai-log.md`.

**Testes:** slides sem estouro de layout no desktop e no celular; o contador
de entradas lê 36 do log.

## 38. Envio de tudo para o GitHub — 05/10/2026 17:44

**Prompt:** "suba tudo para o git então".

**Feito:**
- `git push origin main`: `3d6e686..bc0f388`, os 7 commits das entradas
  31 a 37.
- `git push origin --tags`: as tags novas `v-estavel-readme` e
  `v-estavel-testes`. O GitHub fica com as 7 tags `v-estavel-*`.
- **Conferido:** `main` local igual a `origin/main`.
- Este registro foi enviado num commit separado logo depois.
- **Pendente (só pela interface do GitHub):** ativar o GitHub Pages em
  Settings → Pages → `main` / `(root)`.

**Arquivos:** `docs/ai-log.md`.

## 39. GitHub Pages não publicou — falha do GitHub Actions — 05/10/2026 18:09

**Prompt:** captura de tela das configurações do Pages ("Deploy from a
branch", `main` / `(root)`): "não deu certo, o Pages não apareceu o link".

**Diagnóstico:**
- **Configuração:** estava certa. A tela dizia "Your GitHub Pages site is
  currently being built from the main branch".
- **Execução "pages build and deployment"** (pela API pública do GitHub):
  - o job `build` deu certo (checkout + upload do artefato do site);
  - os jobs `deploy` e `report-build-status` ficaram 15 min na fila e foram
    cancelados com "The job was not acquired by Runner of type hosted even
    after multiple attempts".
- **githubstatus.com:** "Partial System Outage", com Actions em
  **major outage** ("Incident with Actions — investigating"). O Pages
  publica por meio do Actions, então a causa é a instabilidade do GitHub,
  não o projeto nem a configuração.

**Feito:** este registro foi enviado, e o push dispara uma nova tentativa
de publicação, que roda quando o Actions voltar. Também ficou uma
verificação automática do endereço.

**Para a apresentação:** não depender do Pages. O jogo roda localmente com
`python serve.py` (http://localhost:8000).

**Arquivos:** `docs/ai-log.md`.

## 40. Guia para rodar no VS Code + revisão dos slides — 05/10/2026 18:19

**Prompts:**
1. "crie um documento e suba para o GitHub explicando como rodar o projeto
   no VS Code e com instruções para o Claude Code iniciá-lo, para eu fazer
   assim no computador do professor";
2. no meio do trabalho: "veja se, com todas as nossas mudanças, não é
   necessário alterar o HTML da apresentação".

**Feito:**
- **`docs/COMO_RODAR.md` (novo):**
  - pré-requisitos (Chrome/Edge com WebGPU, Python 3, VS Code, Git
    opcional);
  - passo a passo: clonar ou baixar o ZIP → abrir a pasta → `python
    serve.py` no terminal → abrir no Chrome;
  - tabela de problemas comuns, tirados do que já aconteceu no projeto:
    `python` não reconhecido / `py`, porta ocupada, WebGPU indisponível,
    tela preta no navegador do VS Code (entrada 15), `file://`, som só
    depois de um gesto, cache;
  - plano B sem Python (Live Server);
  - pedido pronto para colar no Claude Code, pedindo para não alterar
    arquivos nem commitar;
  - checklist antes de apresentar e o link do GitHub Pages.
- **`serve.py`:** aceita outra porta (`python serve.py 8080`), para o caso
  de a 8000 estar ocupada no outro computador.
- **`CLAUDE.md`:** nova seção "Como rodar o projeto", para o Claude Code
  saber iniciar o servidor sozinho ao abrir a pasta.
- **README:** links para o guia.
- **Revisão dos slides** contra as mudanças do dia:
  - slide 2: entraram torres que desmoronam, buracos que crescem, crateras,
    mira no mouse e ranking;
  - slide 3: a tabela ganhou as entradas 32 e 36, no lugar da 25, que já
    aparece nos slides 4 e 6;
  - slide 7: desempenho "35–54 fps (varia com a máquina)", como no README,
    e "as 3 missões vencidas até o fim nos testes";
  - slide 8: link para o guia.
  - Conferidos e sem mudança: origem do shader, comparação das IAs, resumo
    dos critérios e créditos. O contador de entradas se atualiza sozinho.
  - Pendente: os nomes do grupo.

**Arquivos:** `docs/COMO_RODAR.md` (novo), `serve.py`, `CLAUDE.md`,
`README.md`, `src/presentation.html`, `docs/ai-log.md`.

**Testes:**
- `python serve.py 8001` respondeu 200 com `Cache-Control: no-store`, sem
  derrubar o servidor da 8000. Depois foi parado.
- Slides: sem estouro de layout no desktop e no celular; capturas dos
  slides 2, 3, 7 e 8 conferidas.

## 41. "Erro" no Pages: execução cancelada por uma mais nova — 05/10/2026 18:22

**Prompt:** anotações de uma execução do Pages: "Canceling since a higher
priority waiting request for pages build and deployment @ main exists"
(+ avisos sobre a migração do Ubuntu).

**Diagnóstico (API pública do GitHub):**
- **Não é erro do projeto.** Cada push dispara uma publicação, e o GitHub
  cancela a que está esperando quando chega uma mais nova.
- **Execuções:**
  1. `81316ec`: falhou, porque nenhuma máquina do Actions a assumiu
     (entrada 39);
  2. `b8b310f`: cancelada por causa da seguinte (a mensagem recebida);
  3. `10d30a3`: na fila.
- **githubstatus.com:** o Actions continua em "major outage" ("Incident
  with Actions — investigating"). A publicação na fila roda quando o
  incidente for resolvido.
- **Avisos do Ubuntu:** só informativos, sem efeito.

**Feito:** nada a corrigir. Este registro foi enviado também; o novo push
apenas substitui a publicação na fila por uma equivalente.

**Arquivos:** `docs/ai-log.md`.

## 42. O jogo é pesado demais para o GitHub Pages? — 05/10/2026 18:27

**Prompt:** "mas será que o jogo não é pesado para o Pages?"

**Feito:** medição e resposta, sem mudança de código.
- **Tamanho:** os arquivos versionados somam **~3,0 MB**. Os maiores são o
  modelo `tank.glb` (1,7 MB), o `Tone.js` (0,35 MB) e as imagens dos
  slides.
- **Download para jogar:** ~2,3 MB na primeira visita (HTML + JS + Tone.js
  + modelo).
- **Limites do GitHub Pages:** site de até 1 GB, ~100 GB/mês de tráfego
  (limite flexível) e arquivos de até 100 MB. O projeto fica muito abaixo
  de todos.
- **Onde o jogo pesa:** na GPU de quem joga (WebGPU roda no navegador do
  visitante). O Pages só entrega os arquivos estáticos; não roda nada do
  jogo. O desempenho no Pages é o mesmo do `localhost` na mesma máquina.
- O atraso do link continua sendo o incidente do GitHub Actions (entradas
  39 e 41), não o tamanho.

**Arquivos:** `docs/ai-log.md`.

## 43. GitHub Pages no ar — teste do jogo e dos slides online — 05/10/2026 18:34

**Origem:** a verificação automática deixada na entrada 39 avisou que o site
passou a responder (~19 min depois, quando o GitHub Actions voltou).

**Testes (Playwright, Chrome com GPU, no endereço do Pages):**
- **Arquivos:** `/`, `src/main.js`, `assets/models/tank.glb`,
  `src/presentation.html` e `docs/ai-log.md` respondem 200 com os tipos
  certos (`application/javascript`, `model/gltf-binary`…).
- **Jogo:**
  - "WebGPU ativo" e Tone.js carregado;
  - Começar jogo → briefing → missão rodando;
  - 3 tiros derrubaram o portão, e a captura está igual à versão local;
  - sem erros.
- **Slides:**
  - DOM em 1,8 s e todas as imagens carregadas;
  - o contador leu as 42 entradas do log;
  - os links `.md` foram reescritos para o GitHub (ex.:
    `github.com/.../blob/main/docs/ai-log.md`), que os mostra formatados.

**Problema (só do teste):** a 1ª tentativa de abrir os slides deu timeout,
porque o script navegou para fora da página do jogo ainda rodando. Numa aba
nova, abriu normalmente.

**Feito:** `docs/COMO_RODAR.md` atualizado com os links online (jogo e
slides), mantendo o passo a passo local como garantia sem internet.

**Arquivos:** `docs/COMO_RODAR.md`, `docs/ai-log.md`.

## 44. Slides com prints novos do jogo funcionando — 05/10/2026 19:53

**Prompt:** "ajuste o presentation para que as imagens do jogo apareçam,
tire prints do jogo funcionando".

**Diagnóstico:** as 3 imagens já existentes carregavam (servidor local e
GitHub Pages respondem 200, `naturalWidth` > 0). O que faltava era mostrar
o jogo de fato em ação: só 3 slides tinham imagem, e as capturas eram de
versões anteriores (HUD sem Q/E, por exemplo).

**Feito:**
- **Prints novos** (Playwright + Chrome com GPU, janela visível, porque o
  headless não inicia o WebGPU): menu, briefing da missão 3, portão caindo
  e derrubado (missão 1), torre acertando o tanque (missão 2), combate com
  tanques inimigos e tela de missão falhada (missão 3). Salvos em
  `assets/slides/jogo-*.jpg` (JPG qualidade 88, ~70–100 KB cada).
- **Slide novo "O jogo funcionando"** (3º slide): galeria 3×2 com legenda;
  no celular vira uma coluna.
- Slides 2 e 8 passam a usar as capturas novas.

**Arquivos:** `src/presentation.html`, `assets/slides/jogo-*.jpg` (novos),
`docs/ai-log.md`.

**Testes (Playwright, Chrome):**
- Jogo: "WebGPU ativo", ~60 fps na missão 3, sem erros de JS (o único 404
  é o `favicon.ico`).
- Slides: as 9 imagens carregadas; layout conferido em 1600×900, 1280×720
  e 400×800.

**Problema:** no celular as imagens da galeria se sobrepunham (as linhas do
grid encolhiam com `flex: 1` dentro do slide de altura fixa). Corrigido
com `flex: none` e `aspect-ratio` nas imagens na regra mobile.

## 45. Nomes do grupo nos slides — 05/10/2026 19:58

**Prompt:** colocar o nome dos integrantes: Giulia, Marco, Ruan, Rafael,
Pedro e Yasmin.

**Feito:** "Giulia e grupo" trocado pelos seis nomes na capa e nos
créditos; removidos os comentários `EDITAR: nomes do grupo` (pendência das
entradas anteriores resolvida).

**Arquivos:** `src/presentation.html`, `docs/ai-log.md`.

**Testes:** capa e créditos conferidos em 1600×900 e 400×800; os nomes
cabem em uma linha nos dois tamanhos.

## 46. Visual da apresentação mais bonito — 05/10/2026 20:15

**Prompt:** "deixe a apresentação mais bonita".

**Diagnóstico (capturas dos 11 slides):** cartões esticavam até o fim do
slide e ficavam com grandes áreas vazias (slides 5, 6, 8, 9); slides de
conteúdo todos iguais (fundo azul liso, nada do jogo); slide final vazio.

**Feito (só `src/presentation.html`, só CSS/HTML + um pouco de JS):**
- **Fundo do jogo em cada slide:** captura esmaecida e desfocada à direita
  (`::before` com a imagem em `--bg-img` no próprio `<section>`). O
  desfoque também apaga o texto do HUD das capturas, que distraía.
- **Cartões:** altura do conteúdo (`align-items: start`), gradiente, sombra
  e vidro (`backdrop-filter`); título com marcador amarelo; cartões de
  erros/estatísticas com faixa colorida no topo; números com gradiente.
- **Títulos:** traço antes do "kicker", badge de pontos em gradiente, marca
  "FORTRESS ASSAULT · WEBGPU" no canto.
- **Capa:** etiquetas WebGPU / WGSL / Tone.js e os nomes do grupo em chips.
- **Encerramento:** no estilo da capa (castelo espelhado ao fundo,
  "Obrigado!" grande, chips da equipe, botão "Jogar agora").
- **Zoom:** clicar numa captura mostra em tela cheia; clique, Esc ou trocar
  de slide fecha.
- Letra maior nos cartões de erros e na tabela do ai-log, para ocupar o
  espaço vazio.

**Arquivos:** `src/presentation.html`, `docs/ai-log.md`.

**Testes (Playwright, Chrome):** 11 slides conferidos em 1600×900 e
400×800, imagens carregadas; zoom abre, Esc fecha sem trocar de slide, e a
seta fecha o zoom e avança.

**Problemas:** (1) o texto do HUD das capturas aparecia legível no fundo →
`blur(5px)` + `scale(1.08)` (esconde a borda desfocada); (2) título com
marcador e ✅ ao mesmo tempo no slide 8 → ✅ removido do título; (3)
"Yasmin" quebrava sozinha no cartão da equipe → chips menores dentro de
cartões.
