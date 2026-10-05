# Como rodar o Fortress Assault no VS Code (e com o Claude Code)

Guia para rodar o jogo e os slides em **outro computador**, como o da
apresentação, partindo do zero. Leva de 5 a 10 minutos.

## O que precisa ter no computador

| Programa | Para quê | Como conferir |
|---|---|---|
| **Chrome ou Edge** atualizado | O jogo usa **WebGPU** (Firefox e Safari ainda não servem) | Abrir o jogo: se aparecer "WebGPU não disponível", veja [Problemas comuns](#problemas-comuns) |
| **Python 3** | Servidor local que entrega os arquivos ao navegador | No terminal: `python --version` (no Windows também `py --version`) |
| **VS Code** | Abrir a pasta e o terminal | — |
| Git (opcional) | Baixar o projeto pelo terminal | `git --version`. Sem Git, dá para baixar o ZIP |

Não precisa de internet para jogar: o Tone.js (som) e o modelo 3D estão
dentro do projeto. Sem internet, os slides só trocam a fonte pela do sistema.

## Passo a passo

### 1. Baixar o projeto

**Opção A — com Git** (no terminal, numa pasta qualquer):

```bash
git clone https://github.com/GiuNogueiraSa/fortress-assault.git
```

**Opção B — sem Git:**
1. Abra <https://github.com/GiuNogueiraSa/fortress-assault>.
2. Clique em **Code → Download ZIP**.
3. Extraia o ZIP. A pasta se chama `fortress-assault-main`.

### 2. Abrir no VS Code

Abra **File → Open Folder…** e escolha a pasta do projeto (a que tem o
`index.html` e o `serve.py`).

### 3. Iniciar o servidor

1. Abra o terminal do VS Code: **Terminal → New Terminal**, ou `` Ctrl+` ``.
2. Rode:

   ```bash
   python serve.py
   ```

   No Windows, se `python` não funcionar, use `py serve.py`.
3. Deve aparecer: `Servindo em http://localhost:8000 (sem cache) — Ctrl+C para parar`.
4. **Deixe esse terminal aberto** enquanto estiver usando o jogo.

### 4. Abrir no Chrome ou Edge

- **Jogo:** <http://localhost:8000>
- **Slides:** <http://localhost:8000/src/presentation.html>

Abra num **Chrome ou Edge de verdade**. O navegador embutido do VS Code
(Simple Browser) mostra tela preta com este jogo.

### 5. Para parar

Clique no terminal do VS Code e aperte `Ctrl+C`.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| `'python' não é reconhecido…` ou abre a Microsoft Store | Use `py serve.py`. Se nenhum funcionar, instale o Python em <https://www.python.org/downloads/> marcando **"Add python.exe to PATH"**, e feche e abra o VS Code de novo |
| `OSError: [WinError 10048]` / "address already in use" | A porta 8000 está ocupada. Rode `python serve.py 8080` e abra <http://localhost:8080> |
| "WebGPU não disponível" | 1) Atualize o Chrome/Edge (Menu → Ajuda → Sobre). 2) Ative em `chrome://flags/#enable-unsafe-webgpu` (no Edge: `edge://flags/#enable-unsafe-webgpu`) e reinicie o navegador. 3) Em notebook, deixe na tomada |
| Tela preta | Abriu no navegador do VS Code: use o Chrome ou o Edge |
| Abri o `index.html` com dois cliques e não funciona | Precisa do servidor (passo 3): o jogo usa módulos JavaScript, que não carregam por `file://` |
| Sem som | O navegador só libera áudio depois de um clique ou tecla: clique em "Começar jogo". **N** liga/desliga a música. Confira o volume do Windows |
| Mudei algo e não apareceu | `Ctrl+F5` (recarregar sem cache) |
| Jogo lento | Notebook na tomada, feche outras abas e programas. A janela menor também ajuda |

**Plano B sem Python:**
1. No VS Code, instale a extensão **Live Server** (Ritwick Dey).
2. Clique com o botão direito no `index.html` e escolha **Open with Live
   Server**.
3. Se abrir em outro navegador, copie o endereço (algo como
   `http://127.0.0.1:5500`) para o Chrome.

## Com o Claude Code

Se o computador tiver o **Claude Code**, ele pode fazer os passos 3 e 4 por
você.

1. Abra a pasta do projeto no VS Code (passo 2).
2. Abra o Claude Code: a extensão do VS Code, ou `claude` no terminal.
3. Cole este pedido:

```text
Quero apresentar o projeto Fortress Assault agora. Por favor:
1. Confira se o Python está instalado (python --version; no Windows tente também py --version).
2. Inicie o servidor local em segundo plano nesta pasta com "python serve.py"
   (ou "py serve.py"). Se a porta 8000 estiver ocupada, use "python serve.py 8080".
3. Confirme que o endereço responde e me diga os links do jogo e dos slides
   (src/presentation.html).
4. É só para rodar: não altere nenhum arquivo do projeto (nem o docs/ai-log.md)
   e não faça commits.
```

O `CLAUDE.md` do projeto também explica como iniciar o servidor, então o
Claude Code já sabe o caminho ao abrir a pasta.

## Checklist rápido antes de apresentar

- [ ] Servidor rodando (terminal aberto com "Servindo em http://localhost:8000").
- [ ] Jogo abre no Chrome/Edge: clicar em **Começar jogo** → briefing →
  **Começar missão**.
- [ ] Som saindo (explosão ao atirar, música; **N** liga/desliga).
- [ ] Mira no mouse: clicar no jogo para travar e mover o mouse. **Esc**
  solta o mouse e **M** abre o menu.
- [ ] Slides abrem em `/src/presentation.html`: **← / →** navegam e **F11**
  deixa em tela cheia.
- [ ] Zoom do navegador em 100% (`Ctrl+0`).

## Link online (GitHub Pages)

O jogo também abre direto em <https://giunogueirasa.github.io/fortress-assault/>
(slides: <https://giunogueirasa.github.io/fortress-assault/src/presentation.html>),
sem instalar nada: só o Chrome ou o Edge e internet. Se o link não abrir
(ex.: sem internet, ou o GitHub instável), use o passo a passo acima, que
funciona offline.
