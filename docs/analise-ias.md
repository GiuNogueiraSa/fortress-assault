# Análise comparativa: Claude Code × Gemini × ChatGPT

**Tarefa comparada:** o mesmo prompt pedindo para converter o shader
"Cartoon Explosion" (Shadertoy X3dGz2, versão Godot) de GLSL para WGSL,
explicar as mudanças GLSL → WGSL e mostrar como passar o tempo e a posição do
impacto como uniforms numa aplicação WebGPU.

**Fontes:** resposta do Claude Code (entrada 3 do `docs/ai-log.md`, código em
`src/explosion.js`, commit `add3017`), `docs/Resposta 1 Gemini.txt` e
`docs/Resposta 1 ChatGPT.txt`.

> **Nota sobre imparcialidade:** este documento foi escrito pelo próprio
> Claude Code, uma das IAs comparadas. Para não depender só de opinião,
> o código das três respostas foi **compilado e executado** no mesmo
> navegador (Chrome, WebGPU) e comparado pixel a pixel com o shader GLSL
> original (seção "Como foi testado"). Também há uma diferença de condições:
> o Claude Code trabalhou dentro do repositório, com ferramentas para
> compilar e testar, enquanto Gemini e ChatGPT responderam só no chat, sem
> ver o projeto. Isso favorece o Claude na parte de integração com o jogo,
> mas não na conversão do shader em si.

---

## 1. Resumo executivo

Claude e ChatGPT entregaram shaders WGSL **corretos e fiéis ao original**:
ambos compilam sem avisos e diferem do GLSL em no máximo 0,03% dos pixels.
O Gemini também compila, mas tem **dois problemas graves**:
- o JavaScript que ele sugere falha na validação do WebGPU (buffer de 192
  bytes para uma struct que exige 208);
- a explosão sai com metade do tamanho e sem o contorno preto (12–31% dos
  pixels diferentes).

O ChatGPT deu a explicação mais didática; o Claude, a resposta mais completa
e verificada. Os três têm pelo menos uma afirmação técnica incorreta.

---

## 2. Comparação técnica

### O código WGSL ficou correto/completo à primeira vista?

| IA | Compila? | Roda como sugerido? | Fiel ao original? |
|---|---|---|---|
| **Claude** | Sim, sem avisos | Sim (usado no jogo desde o commit `cc1c042`) | Sim: ≤ 0,03% de pixels diferentes |
| **Gemini** | Sim, sem avisos | **Não**: o `Float32Array` da resposta tem 192 bytes e a struct exige 208, e o WebGPU rejeita o bind group | **Não**: 12–31% de pixels diferentes |
| **ChatGPT** | Sim, sem avisos (fragment e vertex) | Sim, com aspect = 1 | Sim: ≤ 0,03% de pixels diferentes |

Os 0,03% restantes de Claude e ChatGPT são pixels isolados na borda, devidos à
precisão do `sin()` com argumentos grandes, que varia entre GPUs. Não é erro
de conversão.

### Principais diferenças de abordagem

- **Claude**
  - Parâmetros do Godot viraram `const` no WGSL.
  - O uniform tem só o necessário por quadro: matriz, centro do impacto,
    tempo, eixos da câmera e tamanho.
  - Escreveu o **vertex shader do billboard**, que gera o quad pelo
    `vertex_index`, sem vertex buffer, já com o ponto (0,5; 0,4) do quad
    sobre o impacto.
  - Troca alpha/blending por `discard`, já que o alpha do efeito é sempre
    0 ou 1.
  - Validou o resultado contra o GLSL original rodando em WebGL2, lado a
    lado.
- **Gemini**
  - Colocou **todos** os parâmetros (paletas, formas, ruídos) num uniform
    buffer, o que permitiria ajustá-los em tempo de execução.
  - Usou `switch` para escolher a cor da paleta.
  - Não fez vertex shader (o billboard é só uma dica em texto) e representou
    o impacto pelo `disp`, um deslocamento em UV, e não por uma posição 3D.
- **ChatGPT**
  - Parâmetros como `const` e um uniform pequeno (tempo, tamanho, aspect,
    posição do impacto) mais um uniform de câmera.
  - Escreveu o vertex shader do billboard (com vertex buffer de 6 vértices).
  - Explicou a arquitetura em diagramas, sugeriu tempo por explosão (para não
    repetir o loop de 2 s) e alertou para o custo de desempenho.

### Erros óbvios de sintaxe ou conceito

**Gemini:**
- Layout de memória inconsistente. Depois de 13 `f32` (52 bytes), o campo
  `_padding: vec3<f32>` é alinhado em 16 e começa no byte 64, não no 52.
  Assim, todas as paletas ficam 16 bytes adiante do que o JavaScript supõe e a
  struct termina em 208 bytes. Confirmado no teste: *"Binding size (192) … is
  smaller than the minimum binding size (208)"*. Justamente o alinhamento que
  a própria resposta diz ter tratado.
- Mapeamento da coordenada errado: `(uv - 0.5) * 2.0 * size` dobra a escala
  e move o centro em relação ao original, `(uv - (0.5, 0.4)) * size`. A
  explosão fica com metade do tamanho.
- A saída usa `alpha * b`, o que deixa **transparente** o contorno preto
  "cartoon" do original. No original, o contorno é preto opaco.
- Duas afirmações falsas na explicação, ambas testadas:
  - "literais flutuantes exigem `1.0` em vez de `1.`": `1.` é válido em
    WGSL e compila;
  - "WGSL impõe restrições na indexação dinâmica de arrays locais": um
    array `let` com índice dinâmico compila, e é exatamente o que o ChatGPT
    fez.
- Diz que `mod(a, b)` "é substituído por `%`" sem avisar que `%` trunca
  (`-0.5 % 2.0 = -0.5`), enquanto `mod` usa floor (`1.5`). Aqui não causa
  erro porque o tempo é sempre positivo.

**ChatGPT:**
- Correção de proporção invertida e com a fonte errada. O original faz
  `pos.x /= SCREEN_PIXEL_SIZE.x / SCREEN_PIXEL_SIZE.y`, o que equivale a
  multiplicar por largura/altura. O ChatGPT faz `pos.x / aspect` e recomenda
  `aspect = canvas.width / canvas.height`: num quad quadrado no mundo 3D isso
  achata a explosão. O certo seria aspect = 1, ou o do quad. A ressalva no
  texto ("dependendo do quad…") atenua, mas o código de exemplo usa o do
  canvas.
- O shader devolve alpha 0/1, mas a resposta não diz para ligar blending
  (nem usar `discard`). Sem isso, o quad aparece com fundo preto ou "fura" o
  canvas.
- Usa `%` no lugar de `mod`, sem comentar a diferença (sem efeito aqui, como
  no Gemini).

**Claude:**
- Afirmou que precisou renomear `repeat` e `point` por serem palavras
  reservadas do WGSL. **Falso**: as duas compilam (o teste e o código das
  outras IAs confirmam); só `fn` é palavra-chave. A renomeação é inofensiva,
  mas a justificativa estava errada.
- Os parâmetros viraram `const`: ajustar o efeito exige editar o shader. É
  uma troca consciente por simplicidade, mas o Gemini, nesse ponto, deixou o
  efeito mais configurável.

**Gemini e ChatGPT:** nenhum dos dois protege a divisão por zero em
`t = 0` (`repeat = 0`). O Claude limitou `repeat ≥ 0.001`.

### Qual foi a mais clara nas explicações GLSL → WGSL?

**ChatGPT.** Explicou cada mudança com exemplo "antes → depois" (tipos,
conversões explícitas, struct de uniforms, arrays, o que substitui `TIME`,
`SCREEN_UV` e `SCREEN_PIXEL_SIZE`) e acrescentou diagramas da arquitetura
(onde o 3D posiciona e onde o fragment desenha), além de uma seção de
desempenho. É longa, mas bem organizada.

O **Claude** foi mais conciso: uma tabela GLSL × WGSL com os pontos práticos
que realmente pegam na conversão, como a ordem invertida de `select`, `mod`
contra `%` com a diferença explicada e o alinhamento de `vec3`. Tem uma
justificativa errada (as palavras reservadas).

O **Gemini** foi curto e tem duas afirmações incorretas, o que o torna o
menos confiável como material de estudo.

### Como cada uma tratou os uniforms e a estrutura dos dados

- **Claude:** uma struct de 112 bytes, com `mat4` viewProj, `vec3` center +
  `f32` time, `vec3` camRight + `f32` quadSize e `vec3` camUp. Cada `vec3` é
  "colado" a um `f32` para não sobrar buraco de alinhamento. Há um helper
  JavaScript (`explosionUniformData`) que monta o buffer na mesma ordem e
  documenta os offsets; os eixos da câmera vêm da matriz `view`. Testado.
- **Gemini:** uma struct grande com todos os parâmetros e padding manual.
  O conceito é certo (alinhamento de 16 bytes), mas a conta está errada, e
  JavaScript e WGSL discordam nos offsets e no tamanho total.
- **ChatGPT:** uma struct pequena e correta (32 bytes: 4 `f32` + `vec3` +
  padding) e um segundo uniform (`@group(1)`) para a câmera. Separa bem o que
  é do vertex (posição/câmera) e o que é do fragment (tempo/tamanho), e
  explica o porquê do padding.

---

## 3. Tabela de comparação rápida

| Aspecto | Claude | Gemini | ChatGPT |
|---|---|---|---|
| Código válido de primeira | **Sim** | **Não** (o shader compila, mas o buffer JS sugerido é rejeitado pelo WebGPU) | **Sim** |
| Fidelidade visual ao original | ≤ 0,03% de diferença | 12–31% (metade do tamanho, sem contorno) | ≤ 0,03% de diferença |
| Explicação das mudanças | Boa (concisa; 1 justificativa errada) | Fraca (2 afirmações falsas) | **Ótima** (didática e completa) |
| Completude | Tudo implementado (fragment + vertex billboard + helper JS + duração medida do efeito) | Faltou vertex shader e posição 3D do impacto (usa `disp` em UV); sem duração por explosão | Quase tudo (fragment + vertex + JS + tempo por explosão); faltou dizer como tratar a transparência (blending) |
| Uniforms / layout | Correto, compacto, documentado | Conceito certo, conta errada | Correto, bem separado (efeito × câmera) |
| Erros conceituais | Palavras "reservadas" inexistentes | Layout, escala, alpha do contorno, 2 afirmações falsas | Aspect invertido e baseado no canvas; sem blending |
| Proteção contra divisão por zero (t = 0) | Sim | Não | Não |
| Verificou o próprio resultado | Sim (comparação pixel a pixel com o GLSL) | Não | Não |

---

## 4. Conclusão

Para adaptar shaders entre linguagens, **o fator decisivo foi a
verificação**, não a geração. Claude e ChatGPT produziram conversões
praticamente idênticas e fiéis. O Gemini errou justamente nas partes que só
aparecem ao rodar: o alinhamento do buffer e a escala da coordenada.

- **Recomendação para este tipo de tarefa: Claude Code.**
  - Não foi por gerar um shader melhor que o do ChatGPT (empatam no
    shader), mas por conseguir compilar, rodar e comparar o resultado com o
    original antes de entregar.
  - Também integrou o efeito ao projeto real (billboard, uniforms, duração
    medida de 1,3 s).
  - Num prazo curto, isso evita descobrir erros como o do Gemini só na hora
    de rodar.
- **ChatGPT** é uma alternativa sólida, e a melhor das três para *entender*
  a conversão, pela clareza da explicação. O código precisa só de dois
  ajustes de integração: aspect = 1 para o quad quadrado e ligar blending ou
  usar `discard`.
- **Gemini** só com revisão cuidadosa: o código parece correto à primeira
  vista, mas falha na execução, e a explicação tem afirmações falsas.

**Limitações desta análise:** é uma única tarefa, com uma resposta de cada
IA, e as condições foram diferentes (o Claude Code tinha acesso ao projeto e
a ferramentas de teste, as outras responderam só no chat). Serve como
evidência para este caso, não como ranking geral das ferramentas.

---

## Como foi testado

1. O WGSL de cada resposta foi extraído dos arquivos `.txt` sem nenhuma
   alteração e compilado no Chrome com `getCompilationInfo()`. No caso do
   ChatGPT, foram compilados o fragment e o vertex shader da resposta.
2. Cada fragment shader foi executado num quad de tela cheia (o mesmo
   vertex shader de teste para Gemini e ChatGPT; o do próprio projeto para
   o Claude), com os mesmos valores de parâmetros, em t = 0,15 / 0,35 /
   0,6 / 0,9 / 1,2 s. Ao lado, rodou o GLSL original em WebGL2.
3. O Gemini foi testado duas vezes:
   - com o `Float32Array` **exato** da resposta: falha de validação;
   - com o buffer refeito nos offsets reais da struct (208 bytes), para
     avaliar o visual.
4. Foi medida a porcentagem de pixels com diferença acima de 24/255 em
   relação ao original.

| t (s) | Claude | Gemini | ChatGPT |
|---|---|---|---|
| 0,15 | 0,00% | 21,15% | 0,00% |
| 0,35 | 0,00% | 31,45% | 0,00% |
| 0,60 | 0,02% | 20,96% | 0,02% |
| 0,90 | 0,03% | 11,61% | 0,03% |
| 1,20 | 0,00% | 1,19% | 0,00% |

5. As afirmações das explicações foram checadas compilando trechos mínimos:
   - `1.` como literal: compila;
   - `let repeat` e `let point`: compilam;
   - `let fn`: erro;
   - array `let` com índice dinâmico: compila.
