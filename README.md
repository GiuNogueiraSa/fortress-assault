# Tanque 3D em WebGPU

Jogo simples de tanque em 3D renderizado com **WebGPU** (trabalho de
Computação Gráfica). O jogador controla um tanque (modelo 3D glTF) em
terceira pessoa, ajusta a elevação do canhão com o mouse — com uma linha
prevendo a trajetória do tiro — e atira projéteis com física de gravidade real
contra uma trincheira inimiga. Cada acerto explode (bola de fogo, onda de
choque, destroços e tremor de câmera) e abre um buraco irregular no muro, com
a borda queimada e entulho no chão (dá para atirar através dele); com mais de
60% do muro destruído, uma trincheira nova aparece. Todos os objetos usam iluminação por pixel (Lambert +
Blinn-Phong + luz de preenchimento, com variação de cor por ruído).

## Como rodar localmente

O código usa módulos ES (`import`), então **não funciona abrindo o
`index.html` direto pelo arquivo** — é preciso um servidor HTTP local.
Na pasta do projeto:

```sh
python -m http.server 8000
```

Depois abra <http://localhost:8000> num **Chrome ou Edge atualizado** (com
suporte a WebGPU). Se o WebGPU estiver desativado, ative em
`chrome://flags/#enable-unsafe-webgpu`.

## Controles

| Ação | Tecla |
|---|---|
| Andar para frente / ré (na direção do corpo) | W / S |
| Girar o tanque no próprio eixo | A / D |
| Curva (girar enquanto anda) | W ou S + A ou D |
| Travar o mouse para mirar | Clique no canvas |
| Elevação do cano | Mouse (cima / baixo) |
| Atirar | Espaço |
| Liberar o mouse | Esc |

## Estrutura

```
index.html        página, HUD e estilos
src/main.js       inicialização WebGPU, pipeline, entrada e loop do jogo
src/math.js       matrizes 4x4 (perspectiva, lookAt, rotações, translação)
src/geometry.js   primitivas (caixa, cilindro), chão e projétil
src/trench.js     trincheira em grade de células: colisão, buracos e malha
src/tank.js       tanque (modelo 3D ou caixas) e hierarquia chassi → torre → cano
src/gltf.js       loader mínimo de .glb (nós, posições, normais, UVs, índices)
src/lighting.js   shader de iluminação por pixel usado por todos os objetos opacos
src/physics.js    movimento do tanque, disparo, física e previsão da trajetória
src/aimLine.js    linha de mira (pipeline line-strip)
src/explosion.js  shader de explosão (WGSL), onda de choque e ruído compartilhado
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
