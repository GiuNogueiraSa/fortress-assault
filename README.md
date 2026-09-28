# Tanque 3D em WebGPU

Jogo simples de tanque em 3D renderizado com **WebGPU** (trabalho de
Computação Gráfica). O jogador controla um tanque em terceira pessoa, mira o
canhão com o mouse e atira projéteis com física de gravidade real para acertar
um cubo vermelho (o alvo), que explode e muda de lugar a cada acerto.

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
| Travar o mouse para mirar | Clique no canvas |
| Andar (relativo à direção do canhão) | W A S D |
| Mirar (girar / elevar o canhão) | Mouse |
| Atirar | Espaço |
| Liberar o mouse | Esc |

## Estrutura

```
index.html        página, HUD e estilos
src/main.js       inicialização WebGPU, pipeline, entrada e loop do jogo
src/math.js       matrizes 4x4 (perspectiva, lookAt, rotações, translação)
src/geometry.js   primitivas (caixa, cilindro), chão, alvo e projétil
src/tank.js       geometria do tanque e hierarquia chassi → torre → cano
src/physics.js    movimento do tanque, disparo e física dos projéteis
src/explosion.js  shader de explosão (WGSL) + layout do uniform buffer
```

## Créditos

Efeito de explosão adaptado para WGSL a partir de
["Cartoon explosion"](https://www.shadertoy.com/view/X3dGz2) (Shadertoy),
usando como base a versão para Godot publicada em
[godotshaders.com](https://godotshaders.com/shader/cartoon-explosion-effect/).
Licença [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/);
a adaptação em `src/explosion.js` é distribuída sob a mesma licença.
