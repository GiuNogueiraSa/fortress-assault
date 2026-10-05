# Relatório de desenvolvimento — Fortress Assault

## 1. Resumo executivo

- **Projeto:** Fortress Assault, jogo 3D de tanque em WebGPU
- **Estudante:** Giulia + Grupo TCC
- **Curso:** Computação Gráfica — FECAP
- **Data:** 05/10/2026
- **Status:** ✅ Completo e funcional

**Objetivo:** fazer um jogo 3D com foco em computação gráfica, usando WebGPU,
shaders WGSL, partículas 3D e iluminação dinâmica, com IAs generativas
ajudando no desenvolvimento.

**Escopo:**
- Engine 3D em WebGPU puro.
- 3 missões progressivas, com dificuldade crescente.
- Sistema de partículas 3D com física.
- Shader de explosão adaptado do Shadertoy, com cores realistas.
- Som sintetizado com Tone.js.
- Iluminação dinâmica em tempo real.
- Documentação completa do uso de IAs.

**Números do projeto:**
- 19 módulos JavaScript, ~4.200 linhas no total, contando os shaders WGSL
  embutidos (que ficam no mesmo arquivo do módulo).
- 28 entradas no [ai-log.md](ai-log.md) e 28 commits.
- 4 tags de versão estável.

## 2. Arquitetura do projeto

Não há engine nem three.js. O JavaScript (módulos ES) monta os buffers e
pipelines do WebGPU direto, e todo o desenho é feito por shaders WGSL
escritos no projeto. O jogo roda por um servidor HTTP local (`serve.py`),
porque módulos ES não carregam via `file://`.

```
index.html               canvas, HUD, menu (HTML/CSS por cima do canvas); carrega Tone.js e src/main.js
serve.py                 servidor local sem cache (IPv4 + IPv6)
src/
  main.js                inicialização WebGPU, pipelines, fluxo menu → missões, entrada, loop do quadro
  lighting.js            shader principal: sol + sombras, luzes pontuais, materiais, castelo procedural
  explosion.js           shader EXTERNO da explosão (adaptado) + onda de choque
  explosion-particles.js ParticleEmitter: pool de partículas 3D
  explosion-sound.js     sons e música (Tone.js)
  trench.js              castelo: geometria, buracos, colisão, setores
  physics.js             movimento com inércia, balística, trajetória prevista
  missions.js            tabela das 3 missões + progresso salvo
  scores.js              pontuação (velocidade, munição, integridade), rank, recordes
  enemies.js             mira balística das torres e tanques inimigos
  menu.js / hud.js       telas e HUD
  sky.js / scenery.js    céu com sol e nuvens; árvores
  tank.js / gltf.js      tanque (modelo glTF ou caixas) e leitor de .glb
  geometry.js / math.js  malhas procedurais; matrizes 4×4
  aimLine.js             linha da trajetória prevista
  presentation.html      slides da apresentação
assets/
  models/tank.glb        modelo 3D do tanque (CC BY 4.0)
  vendor/Tone.js         Tone.js 14.8.49 (MIT), cópia local
  slides/                capturas do jogo usadas nos slides
docs/                    ai-log, análise das IAs, respostas originais das IAs, este relatório
```

### Loop do quadro (`main.js`)

1. **Tempo:** `dt` do `requestAnimationFrame`, limitado a 0,05 s para não
   saltar depois de uma pausa.
2. **Lógica:** só no modo `playing`.
   - Movimento do tanque com colisão.
   - Projéteis (passo de física fixo).
   - Acertos no castelo → buraco + explosão.
   - Inimigos e tiros deles.
   - Partículas e escombros.
   - Estado da missão (vitória, derrota, tempo).
3. **Uniforms:** a câmera, a cena (luzes) e cada objeto escrevem o seu
   buffer.
4. **Passe de sombra:** profundidade da cena vista do sol, num shadow map
   de 2048².
5. **Passe principal (MSAA 4×), nesta ordem:**
   1. céu;
   2. objetos opacos;
   3. partículas (alpha-to-coverage);
   4. castelo (com os buracos);
   5. linha de mira;
   6. explosões e ondas de choque.
6. **Resolve:** o MSAA é resolvido na textura do canvas.

O menu é o mesmo loop. A cena continua sendo desenhada atrás do HTML, com
a câmera girando em volta do castelo.

## 3. Pipeline de renderização

### Bind groups

| Grupo | Conteúdo | Quem usa |
|---|---|---|
| 0 | Uniform por objeto, 192 bytes: matrizes, tinta, material, opacidade, dano | todos os objetos |
| 1 | Uniform da cena, 144 bytes: matriz do sol + 4 luzes pontuais + parâmetros; shadow map; sampler de comparação | passe principal |
| 2 | Buracos do castelo: até 96, cada um com 2 `vec4` (centro + raio, direção + meio comprimento) | castelo (cor e sombra) |

### Pipelines

| Pipeline | Shader | Detalhe |
|---|---|---|
| `pipeline` | `lighting.js` → `fs_main` | Objetos opacos: tanque, chão, árvores, escombros |
| `trenchPipeline` | `fs_trench` | Castelo procedural com buracos recortados (`discard`) |
| `debrisPipeline` | `fs_main` | Partículas com fade-out via alpha-to-coverage (sem ordenar transparências) |
| `shadowPipeline` / `shadowTrenchPipeline` | `vs_shadow` / `fs_shadow_trench` | Shadow map; os buracos deixam a luz passar |
| `explosionPipeline` | `explosion.js` → `fs_main` | Billboard 3D com o shader externo |
| `shockwavePipeline` | `fs_shockwave` | Anel de onda de choque |
| céu, linha de mira | `sky.js`, `aimLine.js` | Quad de tela cheia; line-strip |

### Técnicas usadas

- **Iluminação por pixel:**
  - sol direcional quente com difusa + especular (Blinn-Phong, vetor
    meio-caminho `H`);
  - luz de preenchimento azul do céu;
  - ambiente hemisférico (céu × chão);
  - rim light;
  - névoa por distância.
- **Sombras:** shadow map ortográfico do sol (profundidade 0..1 do WebGPU),
  PCF 3×3 para borda suave e `depthBias` contra "shadow acne".
- **MSAA 4×**, com `devicePixelRatio` limitado a 1.5 (o custo cresce com o
  quadrado da resolução).
- **Castelo procedural no shader:**
  - pedras por Voronoi;
  - hera e flores por ruído;
  - portão e ameias.
  - Fica em coordenadas **locais**, e a escala de cada missão vai só na
    matriz de modelo. Assim os buracos e as colisões funcionam em qualquer
    tamanho.
- **Buracos:** cilindros na direção horizontal do tiro, com corte oval
  (`HOLE_STRETCH_Y = 1.3`). O fragment descarta os pixels de dentro e
  desenha queimado e borda irregular em volta. A colisão do tanque usa a
  mesma descrição, então dá para atravessar o castelo por um buraco.
- **Tanque:** modelo glTF com cores do código. Pintas de onça por Voronoi
  e marcas de dano que crescem com os impactos, ambas no shader.

## 4. Shader externo: explosão

- **Fonte:** "Cartoon explosion", [Shadertoy X3dGz2](https://www.shadertoy.com/view/X3dGz2).
- **Versão usada como base:** a do Godot, publicada por RayL019 em
  [godotshaders.com](https://godotshaders.com/shader/cartoon-explosion-effect/).
- **Licença:** CC BY-NC-SA 3.0. A adaptação em `src/explosion.js` está sob
  a mesma licença, e a fonte está documentada no cabeçalho do arquivo.

**Adaptações:**

1. **GLSL/Godot → WGSL.** Removidos `SCREEN_UV`, `TIME` e `COLOR`. A
   coordenada 2D vem do UV de um quad billboard 3D gerado no vertex shader
   (sem vertex buffer), com o ponto (0.5, 0.4) do quad sobre o impacto.
2. **`mod` reimplementado:** o `%` do WGSL trunca em vez de usar floor.
3. **Uniforms com valor padrão viraram `const`:** o WGSL não tem default.
4. **Correções de bugs do original:** `clamp` no índice da paleta (podia
   sair do array) e `repeat ≥ 0.001` (divisão por zero em t = 0).
5. **`discard`** no lugar de blending: o alpha é sempre 0 ou 1.
6. **Uniform buffer de 112 bytes:** cada `vec3f` vem "colado" a um `f32`
   para respeitar o alinhamento de 16 bytes.
7. **Contorno pela derivada de tela (`fwidth`).** O original avaliava o
   efeito mais 4 vezes por pixel. Com isso a missão 3 subiu de 22 para
   54 fps.
8. **Duração de 2.5 s:** o tempo do efeito corre mais devagar.
9. **Cor em 5 fases pelo tempo (`phaseColor`):** branco → amarelo →
   laranja → vermelho escuro → fumaça preta. A fumaça também segue a fase.
10. **Turbulência fBm** do gradient noise 3D (Perlin), com 2 oitavas.

**Validação:** o port inicial foi comparado pixel a pixel com o GLSL original
rodando em WebGL2, lado a lado: diferença de **no máximo 0,03% dos pixels**.
Os itens 7 a 10 mudam o visual de propósito, depois dessa validação.

## 5. Partículas 3D (`explosion-particles.js`)

- `ParticleEmitter` com **pool fixo** de 240 partículas (4 explosões × 60),
  sem alocar nada durante o jogo. Quando o pool enche, as mais antigas
  são reaproveitadas.
- **15 formas geradas uma vez, compartilhadas na GPU:**
  - 6 cubos/lascas irregulares;
  - 3 esferas;
  - 6 octaedros deformados.
- **Física:**
  - velocidade de 5–15 u/s na meia esfera de cima (as de baixo nasceriam
    dentro do chão);
  - gravidade −9,8 com o mesmo `stepProjectile` dos tiros;
  - um quique e depois param.
- **Rotação:** eixo aleatório a 360–720°/s, com a matriz de Rodrigues
  (`mat4.rotationAxis`).
- **Vida:** de 3 a 5 s, com alpha de 1 a 0 (alpha-to-coverage).
- **Cores:**
  - azul (pedra), verde (hera) e vermelho/rosa (flores);
  - lascas metálicas quando o acerto é num tanque.

## 6. Iluminação dinâmica

- Uma luz pontual por explosão, até 4 ao mesmo tempo, no array `lights` do
  uniform da cena.
- **Cor:** RGB (1.0, 0.7, 0.2).
- **Intensidade:** 2.0 × (1 − idade/2.5), mais um clarão curto de 0.12 s no
  início.
- **Atenuação:** `I / (1 + d²)`, com d medido em unidades de 3 m. Com d em
  metros, a luz sumia a 2–3 m da explosão. Há um corte suave entre 14 e 20
  (raio 20).
- Entra no `shadeFull` e ilumina tudo que usa a iluminação completa:
  castelo, chão, tanques, árvores e partículas.
- **Sem sombra da luz pontual,** por desempenho.

## 7. Som (`explosion-sound.js`)

- **Tone.js 14.8.49 (MIT).** Carregado por `<script>` porque o arquivo é
  UMD, não módulo ES. Fica numa cópia local para funcionar sem internet.
- **Instrumentos:** criados uma vez e reaproveitados.
  - Explosão: ruído marrom com envelope → passa-baixa de 1 kHz, mais um
    "boom" G2 com pitch descendente. O volume cai com a distância à
    câmera, e explosões a menos de 60 ms uma da outra tocam um som só.
  - Tiro: dente-de-serra D5. Impacto no tanque: batida A2.
  - Alerta de tempo: bip quadrado C6 aos 30 s.
  - Música ambiente: PolySynth triângulo em loop (C – G – Am – Em, 60 BPM,
    −24 dB). A tecla **N** liga/desliga.
- **Início:** o navegador só libera áudio depois de um gesto, então o som
  inicia no 1º clique ou tecla. Se o Tone.js falhar, o jogo segue em
  silêncio.

## 8. Jogabilidade e física

| | Missão 1 | Missão 2 | Missão 3 |
|---|---|---|---|
| Escala do castelo | 1.0 | 1.12 | 1.25 |
| Acertos por setor / portão | 8 / 3 | 10 / 5 | 12 / 6 |
| Torres atiram | não | a cada 2 s, mira com erro | a cada 1 s, prevê o movimento |
| Tanques inimigos | — | — | 3 (tiro a cada 2,5 s) |
| Munição / tempo | ∞ / livre | 75 / livre | 100 / 180 s |
| Impactos que o tanque aguenta | 5 | 5 | 5 |

- **Vitória:** zerar os 3 setores (Torre esq., Portão, Torre dir.); na
  missão 3, também os tanques inimigos. A câmera então voa para o pátio
  iluminado.
- **Progresso:** salvo em `localStorage`, com try/catch: sem armazenamento
  o jogo funciona, só não salva.
- **Fluxo das telas:**
  - menu (título animado, câmera orbitando, poeira);
  - briefing da missão (objetivos e controles; o botão libera em 3 s, e
    Espaço também começa);
  - transição com tela preta: 1,5 s escurecendo, com a câmera se
    aproximando do castelo, e 0,5 s clareando;
  - missão.
- **Fim da missão:**
  - vitória: voo da câmera para o pátio com confete, depois a tela de
    ranking. "Próxima" abre o briefing seguinte, que começa sozinho em
    3 s;
  - derrota: motivo e progresso dos setores, com Tentar de novo /
    Escolher / Menu.
- **Pontuação (`scores.js`):** 3 notas de 0 a 1000.
  - Velocidade: 1000 até metade do tempo de referência, caindo até 0 em
    2× o tempo.
  - Munição: tiros mínimos ÷ tiros disparados.
  - Integridade: saúde restante.
  - Rank pela porcentagem de 3000: Excelente ≥ 90%, Ótimo ≥ 75%,
    Bom ≥ 55%, Regular abaixo disso.
  - Recordes em `mission_N_best_score`, mostrados na tela Scores.
- **Movimento:**
  - W/S andam (2,4 u/s) e A/D giram (1,5 rad/s), com inércia: lerp de
    0,15 por quadro, independente do fps;
  - colisão com o castelo amostrada em 38 pontos (centro + anéis de raio
    0,42 e 0,85, em 2 alturas): o tanque só para quando 3 ou mais estão
    dentro da pedra;
  - mundo de ±200 até o horizonte.
- **Tiro:** balístico (velocidade 11, gravidade −9,8). A linha de mira
  mostra a trajetória prevista até o 1º obstáculo.
- **Inimigos:** usam a solução de trajetória baixa para acertar o alvo com
  velocidade fixa (15).

## 9. Desempenho

| Momento | Situação | FPS |
|---|---|---|
| Entrada 21 | Castelo com sombras, DPR 2 | 43–47 |
| Entrada 23, antes | Missão 3 em combate | 22 |
| Entrada 23, depois | Contorno da explosão por `fwidth` | 54 |
| Entrada 24 | + 60 partículas por explosão + luzes pontuais + som | 53 |
| Entrada 25 | + fBm, 2 oitavas (3 oitavas davam ~35) | ~41, igual à versão anterior na mesma hora |
| Entrada 28 | Menu, transições e ranking (só HTML/JS; poeira só no menu) | 30–35 contra 21–25 da versão anterior, na mesma sessão com a máquina lenta: sem perda |

- **Como foi medido:** Chrome com GPU real, janela de 1000×700, em
  navegador isolado (um navegador compartilhado congelava a 2ª janela).
- **O que mais pesa:** o fragment shader da explosão, quando ela fica perto
  da câmera e cobre boa parte da tela. Cada mudança nele foi medida.
- **Variação da máquina:** o mesmo código variou de 53 para ~41 fps em
  horários diferentes. Por isso as comparações finais foram feitas
  alternando as versões antiga e nova (`git stash`) na mesma sessão.

## 10. Testes

Não há testes unitários formais. A verificação foi feita com scripts
Playwright (Python) dirigindo o Chrome com WebGPU real:

- **Relógio virtual:** `performance.now`, `requestAnimationFrame` e
  `Math.random` fixos, para resultados repetíveis. Assim a refatoração
  inicial foi provada idêntica ao protótipo (capturas iguais pixel a
  pixel).
- **Fluxo completo das missões (`missions_check.py`):**
  - Missão 1: vitória.
  - Missão 2: as torres derrubam o tanque → derrota → "Tentar de novo".
  - Missão 3: tanques inimigos e tempo esgotado.
- **Visual:** capturas por quadro (fases da explosão, buracos, castelo).
- **Desempenho:** medição de fps e tempo de quadro p95 em combate.
- **Erros:** console e `pageerror` monitorados em todos os testes. O HUD
  também mostra erros de GPU (`uncapturederror`, `device.lost`).

## 11. Uso de IA no desenvolvimento

- **Claude Code** (principal) trabalhou dentro do repositório, sob as
  regras do [CLAUDE.md](../CLAUDE.md):
  - WebGPU obrigatório;
  - shader externo documentado;
  - nada de uso não gráfico da GPU;
  - solução mais simples;
  - commits descritivos;
  - registro de cada prompt.
- **[ai-log.md](ai-log.md):** 27 entradas cronológicas, cada uma com
  prompt resumido, o que foi feito, arquivos, testes e problemas.
- **Comparação ([analise-ias.md](analise-ias.md)):** Claude, Gemini e
  ChatGPT receberam o mesmo prompt de conversão do shader, e o código das
  três foi compilado e comparado pixel a pixel com o original.
  - Claude e ChatGPT ficaram fiéis (≤ 0,03%).
  - O código JavaScript do Gemini falha na validação do WebGPU (buffer de
    192 bytes para uma struct de 208), e o visual difere em 12–31%.
- **Quando o pedido não batia com o projeto,** a decisão foi registrada no
  log. Exemplos:
  - o exemplo usava three.js, mas o projeto é WebGPU puro;
  - o Tone.js não pode ser importado como módulo ES;
  - 6 oitavas de turbulência pesariam demais;
  - exemplos de bugs que não constavam no histórico foram trocados nos
    slides.

**Principais problemas e correções** (detalhes no log):

| Entrada | Problema | Correção |
|---|---|---|
| 3 | Paleta fora do array; divisão por zero em t = 0 | `clamp` e `repeat ≥ 0.001` |
| 8 | 2º tiro batia no "fundo" do buraco (o tiro sai mais baixo do que entrou) | Buraco centrado no meio da espessura da parede |
| 15 | Tela preta no navegador embutido do VS Code | Diagnóstico de erros de GPU no HUD; usar o Chrome |
| 19 | Mudanças não apareciam: cache + servidor antigo em IPv6 | `serve.py` com `no-store` e IPv4 + IPv6 |
| 22 | Difícil abrir passagem no castelo; câmera entrando nas paredes | Buraco horizontal oval, regra de 3+ pontos, câmera que se aproxima |
| 23 | 22 fps em combate | Contorno por `fwidth` (54 fps) |
| 25 | Fases laranja/vermelha invisíveis; fBm pesado | Fumaça segue a fase; 2 oitavas |

## 12. Limitações conhecidas

- **Navegador:** precisa de um navegador com WebGPU. Foi testado no Chrome.
  O navegador embutido do VS Code mostrou tela preta (entrada 15) e não é
  usado.
- **FPS:** varia com a máquina e a carga. Na missão 3 em combate ficou
  entre ~41 e 54. Explosões muito perto da câmera são o ponto mais pesado.
- **Som:** os testes automáticos confirmam que o áudio inicializa e toca sem
  erro, mas não "ouvem" o resultado.
- **Teste completo:** depois das entradas 24–26, o roteiro completo das
  missões não foi reexecutado até o fim. Foram feitos o teste de fumaça e
  o de desempenho da missão 3.
- **Física:** a luz pontual não projeta sombra, e as partículas não
  colidem com o castelo (só com o chão).

## 13. Como rodar

```sh
python serve.py
```

- **Jogo:** http://localhost:8000
- **Slides:** http://localhost:8000/src/presentation.html
- **Voltar a uma versão estável:** `git checkout v-estavel-explosao` (ou
  `v-estavel-missoes`).

## 14. Créditos

- **Shader de explosão:** "Cartoon explosion", Shadertoy X3dGz2 (versão
  Godot por RayL019), CC BY-NC-SA 3.0.
- **Modelo 3D:** ["Tank"](https://sketchfab.com/3d-models/tank-9d28a36e12c24f94b852610677706552),
  de Willy Decarpentrie, CC BY 4.0.
- **Som:** [Tone.js](https://tonejs.github.io/) v14.8.49, licença MIT.
