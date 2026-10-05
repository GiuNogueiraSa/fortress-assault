# Fortress Assault — tanque 3D em WebGPU

Jogo de tanque em 3D renderizado com **WebGPU** (trabalho de Computação
Gráfica — FECAP). Abre num **menu** (com o castelo ao pôr do sol ao fundo),
com tutorial e créditos. São **3 missões** em progressão, e cada uma
desbloqueia a seguinte (o progresso fica salvo no navegador):

1. **Fortaleza simples:** munição ilimitada, sem contra-ataque.
2. **Fortaleza maior:** as torres atiram de volta, 75 tiros, o tanque aguenta
   5 impactos.
3. **Fortaleza épica:** torres que preveem o movimento, 3 tanques inimigos,
   100 tiros e 3 minutos.

Para vencer, zere os 3 setores (Torre esq., Portão, Torre dir.); na
missão 3 também é preciso destruir os tanques inimigos. A câmera então voa
para dentro do pátio iluminado.

O tanque (modelo glTF, amarelo com pintas de onça) tem inércia e câmera 360°.
O castelo pode ser destruído em qualquer parte, com buracos recortados no
shader. A cena tem sombras, céu com sol e nuvens, e explosões de 2.5 s com
fogo turbulento (branco → amarelo → laranja → vermelho → fumaça preta), onda
de choque, 60 partículas 3D, uma luz dinâmica por explosão e tremor. O som é
sintetizado em tempo real com Tone.js: explosões, tiro, impacto, alerta de
tempo e música ambiente.

## Como rodar localmente

O código usa módulos ES (`import`), então **não funciona abrindo o
`index.html` direto pelo arquivo** — é preciso um servidor HTTP local.
Na pasta do projeto:

```sh
python serve.py
```

(`serve.py` é o servidor de arquivos do Python com o cache desligado. Com o
`python -m http.server` comum, o navegador pode continuar usando versões
antigas dos `.js` depois que o código muda.)

Depois abra <http://localhost:8000> num **Chrome ou Edge atualizado** (com
suporte a WebGPU). Se o WebGPU estiver desativado, ative em
`chrome://flags/#enable-unsafe-webgpu`.

## Controles

| Ação | Tecla |
|---|---|
| Andar para frente / ré (com inércia) | W / S |
| Girar o tanque | A / D |
| Elevação do cano | ↑ / ↓ |
| Atirar (a linha mostra a trajetória) | Espaço |
| Câmera 360° ao redor do tanque | Mouse (clique no jogo para travar) |
| Menu / pausa | M (ou Esc com o mouse solto) |
| Liga/desliga a música | N |
| Soltar o mouse | Esc |

## Estrutura

```
index.html        página, HUD e estilos
src/main.js       WebGPU, pipelines, fluxo menu → missões, entrada e loop do jogo
src/missions.js   configuração das 3 missões e progresso salvo
src/menu.js       menu principal, tutorial, créditos, telas de vitória/derrota
src/hud.js        HUD: setores, vida, munição, tempo, avisos, minimapa
src/enemies.js    mira balística das torres e tanques inimigos
src/math.js       matrizes 4x4 (perspectiva, lookAt, rotações, translação)
src/geometry.js   primitivas (caixa, cilindro, pedra irregular), chão e projétil
src/trench.js     castelo: torres, muralhas, portão em arco, pátio, buracos e colisões
src/tank.js       tanque (modelo 3D ou caixas) e hierarquia chassi → torre → cano
src/gltf.js       loader mínimo de .glb (nós, posições, normais, UVs, índices)
src/lighting.js   iluminação, sombras (shadow map), padrões (onça, pedras, hera, grama) e buracos
src/physics.js    movimento do tanque, disparo, física e previsão da trajetória
src/aimLine.js    linha de mira (pipeline line-strip)
src/sky.js        céu em gradiente com sol e nuvens (triângulo em tela cheia)
src/scenery.js    árvores de fundo
src/explosion.js  shader de explosão (WGSL), onda de choque e ruído compartilhado
src/explosion-particles.js  ParticleEmitter (pool) das partículas 3D da explosão
src/explosion-sound.js      sons e música com Tone.js
assets/vendor/Tone.js       Tone.js 14.8.49 (MIT), cópia local
assets/models/    modelo 3D do tanque (tank.glb)
```

Plano B: em `src/main.js`, `const USE_MODEL_3D = false` volta para o tanque
antigo feito de caixas. Se o `.glb` não carregar, o jogo usa as caixas
sozinho e avisa no HUD.

## Créditos

Efeito de explosão adaptado para WGSL a partir de
["Cartoon explosion"](https://www.shadertoy.com/view/X3dGz2) (Shadertoy),
usando como base a versão para Godot publicada em
[godotshaders.com](https://godotshaders.com/shader/cartoon-explosion-effect/).
Licença [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/);
a adaptação em `src/explosion.js` é distribuída sob a mesma licença.

Modelo 3D do tanque: ["Tank"](https://sketchfab.com/3d-models/tank-9d28a36e12c24f94b852610677706552)
por [Willy Decarpentrie](https://sketchfab.com/skudgee), licença
[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Alterações: cores do
material substituídas por código (a textura original não é usada), escala e
orientação ajustadas, cano separado do resto para girar com a mira.

Som: [Tone.js](https://tonejs.github.io/) v14.8.49, licença MIT, cópia local
em `assets/vendor/Tone.js`. Todos os sons são sintetizados (sem arquivos de
áudio).
