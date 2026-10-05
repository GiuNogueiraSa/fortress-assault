// ---------- Efeito de explosão (shader externo, adaptado para WGSL) ----------
//
// FONTE ORIGINAL (efeito obtido da internet, conforme requisito do trabalho):
//   "Cartoon explosion" — Shadertoy: https://www.shadertoy.com/view/X3dGz2
//   Versão portada para Godot usada como base desta adaptação:
//   https://godotshaders.com/shader/cartoon-explosion-effect/
//   Licença: Creative Commons BY-NC-SA 3.0 (uso não comercial, com atribuição;
//   esta adaptação é distribuída sob a mesma licença).
//
// ADAPTAÇÕES feitas aqui (GLSL/Godot -> WGSL):
//   - Removido o que é específico do Godot (SCREEN_UV, SCREEN_PIXEL_SIZE, TIME,
//     hint_range, COLOR). A coordenada 2D vem do UV de um quad billboard 3D.
//   - Uniforms com valor padrão do Godot viraram `const` (WGSL não tem default).
//   - `mod` do GLSL reimplementado (o `%` do WGSL trunca em vez de usar floor).
//   - `repeat` limitado a >= 0.001 para evitar divisão por zero em t = 0.
//   - Índice das paletas limitado com clamp (no original podia sair do array).
//   - `disp` e `oct_noise` removidos (disp = 0 por padrão; oct_noise não era usado).
//   - Pixels com alpha 0 são descartados (`discard`), então não precisa de blending.
//   - Paletas trocadas para fogo mais realista: núcleo amarelo/laranja, borda
//     vermelho/marrom e fumaça marrom-escura (o original era roxo/rosado).
//   - OTIMIZAÇÃO do contorno: o original estima a distância até a borda com o
//     gradiente por diferenças finitas (avalia o efeito inteiro mais 4 vezes
//     por pixel, ~12 worley de 27 células). Explosões perto da câmera cobriam
//     meia tela e derrubavam o jogo para ~22 fps. Aqui a borda usa a derivada
//     de tela (fwidth) do campo já calculado: mesmo traço preto, com largura
//     em pixels, e ~5x menos trabalho por pixel.
//   - Explosão "realista": dura 2.5 s (tempo do efeito desacelerado), cores
//     em degradê suave branco → amarelo → laranja → vermelho → preto (no lugar
//     da paleta posterizada), escurecendo com o tempo, e turbulência extra com
//     o gradient noise 3D (Perlin) deformando o campo.

// Layout do uniform buffer (112 bytes). vec3f ocupa 16 bytes de alinhamento,
// por isso cada vec3f vem "colado" com um f32 para não sobrar buraco.
export const EXPLOSION_UNIFORM_BYTES = 112;
// Com repeat = 1 o ciclo do shader é de 2 s, mas medido na prática nada fica
// visível a partir de t ≈ 1.3 s — dá para parar de desenhar o quad aí.
// 2.5 s: o efeito original some em ~1.3 s; aqui o tempo do efeito corre mais
// devagar (EFFECT_TIME_SCALE) para a explosão durar 2.5 s
export const EXPLOSION_DURATION = 2.5;
const EFFECT_TIME_SCALE = 1.3 / EXPLOSION_DURATION;

// Monta os dados do uniform buffer. `view` é a matriz de visão (lookAt): as
// linhas dela são os eixos direita/cima da câmera, usados para o billboard.
export function explosionUniformData(viewProj, view, center, time, quadSize) {
  const d = new Float32Array(EXPLOSION_UNIFORM_BYTES / 4);
  d.set(viewProj, 0);                          // viewProj  (offset 0)
  d.set(center, 16); d[19] = time;             // center    (64) + time     (76)
  d.set([view[0], view[4], view[8]], 20);      // camRight  (80)
  d[23] = quadSize;                            //             + quadSize (92)
  d.set([view[1], view[5], view[9]], 24);      // camUp     (96)
  return d;
}

// Gradient noise 3D do shader original (n_rand3 + noise). Exportado para ser
// reaproveitado também na iluminação (variação sutil de cor, src/lighting.js).
export const NOISE_WGSL = /* wgsl */ `
fn n_rand3(p: vec3f) -> vec3f {
  let r = fract(sin(vec3f(
    dot(p, vec3f(127.1, 311.7, 371.8)),
    dot(p, vec3f(269.5, 183.3, 456.1)),
    dot(p, vec3f(352.5, 207.3, 198.67)),
  )) * 43758.5453) * 2.0 - 1.0;
  return normalize(r / cos(r));
}

// Um termo do gradient noise: gradiente do canto (nv + o) projetado em (fv - o)
fn corner(nv: vec3f, fv: vec3f, o: vec3f) -> f32 {
  return dot(n_rand3(nv + o), fv - o);
}

fn noise(p: vec3f) -> f32 {
  let fv = fract(p);
  let nv = floor(p);
  let w = fv * fv * fv * (fv * (fv * 6.0 - 15.0) + 10.0);
  return mix(
    mix(
      mix(corner(nv, fv, vec3f(0.0, 0.0, 0.0)), corner(nv, fv, vec3f(1.0, 0.0, 0.0)), w.x),
      mix(corner(nv, fv, vec3f(0.0, 1.0, 0.0)), corner(nv, fv, vec3f(1.0, 1.0, 0.0)), w.x),
      w.y),
    mix(
      mix(corner(nv, fv, vec3f(0.0, 0.0, 1.0)), corner(nv, fv, vec3f(1.0, 0.0, 1.0)), w.x),
      mix(corner(nv, fv, vec3f(0.0, 1.0, 1.0)), corner(nv, fv, vec3f(1.0, 1.0, 1.0)), w.x),
      w.y),
    w.z);
}
`;

// Onda de choque: anel que se expande e some, desenhado no mesmo quadro
// billboard da explosão (mesmo uniform buffer, com quadSize maior).
export const SHOCKWAVE_DURATION = 0.2;  // anel de 0.5 a 3 unidades em 0.2 s
export const SHOCKWAVE_QUAD_SIZE = 8.0;  // lado do quad do anel (cobre raio 3)

export const explosionShaderCode = /* wgsl */ `
struct ExplosionUniforms {
  viewProj: mat4x4f,
  center: vec3f,     // ponto de impacto (mundo)
  time: f32,         // segundos desde o impacto (substitui iTime)
  camRight: vec3f,
  quadSize: f32,     // lado do quad em unidades de mundo
  camUp: vec3f,
};
@group(0) @binding(0) var<uniform> u: ExplosionUniforms;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

// Quad gerado a partir do vertex_index (sem vertex buffer), sempre de frente
// para a câmera. uv = (0.5, 0.4) fica exatamente no ponto de impacto, igual ao
// "centro" da explosão no shader original (pos = uv - vec2(.5, .4)).
@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let uv = corners[vi];
  let world = u.center + (u.camRight * (uv.x - 0.5) + u.camUp * (uv.y - 0.4)) * u.quadSize;
  var out: VertexOut;
  out.position = u.viewProj * vec4f(world, 1.0);
  out.uv = uv;
  return out;
}

// tempo do efeito (desacelerado para durar EXPLOSION_DURATION)
fn etime() -> f32 {
  return u.time * ${EFFECT_TIME_SCALE.toFixed(4)};
}

// Parâmetros (eram uniforms com valor padrão no Godot)
const SIZE = 5.0;
const DISPERSE = 1.0;
const BOOM_REPEAT = 1.0;
const BOOM_SHAPE = 12.0;
const BOOM_DISTORTION = 0.5;
const BOOM_BUBBLES = 0.5;
const BOOM_BW = 0.5;
const SMOKE_REPEAT = 1.0;
const SMOKE_SHAPE = 16.0;
const SMOKE_DISTORTION = 1.5;
const SMOKE_BUBBLES = 0.5;
const SMOKE_BW = 0.75;

// mod() do GLSL: x - y * floor(x / y)
fn glsl_mod(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

${NOISE_WGSL}
fn worley(s: vec3f) -> f32 {
  let si = floor(s);
  let sf = fract(s);
  var m_dist = 1.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      for (var z = -1; z <= 1; z++) {
        let neighbor = vec3f(f32(x), f32(y), f32(z));
        var pt = fract(n_rand3(si + neighbor));
        pt = 0.5 + 0.5 * sin(DISPERSE * etime() + 6.2831 * pt);
        let diff = neighbor + pt - sf;
        m_dist = min(m_dist, length(diff));
      }
    }
  }
  return m_dist;
}

fn boom(p: vec2f) -> f32 {
  let rep = max(glsl_mod(etime() * BOOM_REPEAT, 2.0), 0.001);
  let shape = 1.0 - dot(p, p) / (rep * BOOM_SHAPE) - rep * 2.0;
  let distortion = noise(vec3f(p * BOOM_DISTORTION, etime() * 0.5));
  let bubbles = BOOM_BUBBLES - pow(worley(vec3f(p * 1.2, etime() * 2.0)), 3.0);
  let effects = BOOM_BW * bubbles + (1.0 - BOOM_BW) * distortion;
  return shape + effects;
}

fn smoke(p: vec2f) -> f32 {
  let rep = max(glsl_mod(etime() * SMOKE_REPEAT, 2.0), 0.001);
  let rise = vec2f(0.0, 2.0) * pow(rep / 1.45, 2.0) * 1.5;   // fumaça sobe com o tempo
  let q = p - rise;
  let shape = 1.0 - dot(q, q) / (rep * SMOKE_SHAPE) - pow(rep * 1.5, 0.5);
  let distortion = noise(vec3f(p * SMOKE_DISTORTION - rise, etime() * 0.1));
  let rise2 = vec2f(0.0, 2.0) * pow(rep / 1.65, 2.0) * 1.5;
  let bubbles = SMOKE_BUBBLES - pow(worley(vec3f(p / pow(rep, 0.35) - rise2, etime() * 0.1)), 2.0);
  let effects = SMOKE_BW * bubbles + (1.0 - SMOKE_BW) * distortion;
  return shape + effects;
}

fn f(p: vec2f) -> f32 {
  return max(boom(p), smoke(p));
}

fn posterize(v: f32, n: i32) -> f32 {
  let nf = f32(n);
  return floor(v * nf) / (nf - 1.0);
}

// Degradê do fogo por "calor" h (0..1): preto → vermelho → laranja → amarelo → branco
fn fireRamp(h: f32) -> vec3f {
  let c0 = vec3f(0.04, 0.025, 0.02);
  let c1 = vec3f(0.72, 0.10, 0.03);
  let c2 = vec3f(1.00, 0.45, 0.05);
  let c3 = vec3f(1.00, 0.84, 0.25);
  let c4 = vec3f(1.00, 0.98, 0.88);
  let x = clamp(h, 0.0, 1.0) * 4.0;
  if (x < 1.0) { return mix(c0, c1, smoothstep(0.0, 1.0, x)); }
  if (x < 2.0) { return mix(c1, c2, smoothstep(1.0, 2.0, x)); }
  if (x < 3.0) { return mix(c2, c3, smoothstep(2.0, 3.0, x)); }
  return mix(c3, c4, smoothstep(3.0, 4.0, x));
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  var pos = (in.uv - vec2f(0.5, 0.4)) * SIZE;
  // turbulência: o gradient noise 3D (Perlin) desloca o ponto antes do campo
  let tp = vec3f(pos * 0.7, etime() * 0.6);
  pos = pos + 0.45 * vec2f(noise(tp), noise(tp + vec3f(5.2, 1.3, 2.7)));

  let age01 = clamp(u.time / ${EXPLOSION_DURATION.toFixed(2)}, 0.0, 1.0);   // 0 → 1 ao longo da explosão

  let boom_val = boom(pos);
  let boom_a = step(0.0, boom_val);
  // calor: mais forte no núcleo (campo alto) e no começo; esfria com o tempo
  let heat = boom_val * 1.5 + 0.55 - 0.75 * smoothstep(0.05, 0.9, age01);
  let boom_col = fireRamp(heat);

  let smoke_val = smoke(pos);
  let smoke_a = step(0.0, smoke_val);
  // fumaça: marrom-escuro que vai ficando preta
  let smoke_col = mix(vec3f(0.30, 0.24, 0.20), vec3f(0.06, 0.05, 0.05), clamp(age01 * 1.2 - smoke_val * 0.6, 0.0, 1.0));

  // contorno preto "cartoon": |campo| / variação do campo por pixel = distância
  // até a borda em pixels (mesma ideia do original, via derivada de tela)
  let field = max(boom_val, smoke_val);
  let px = abs(field) / max(fwidth(field), 1e-5);
  let b = smoothstep(0.8, 1.8, px);
  let bw = step(smoke_val * 1.25, boom_val);

  let color = bw * boom_col + (1.0 - bw) * smoke_col;
  let alpha = bw * boom_a + (1.0 - bw) * smoke_a;
  if (alpha < 0.5) {
    discard;
  }
  return vec4f(color * b, 1.0);
}

// Anel de onda de choque (efeito próprio, não vem do shader original):
// raio cresce rápido e desacelera (sqrt), fica mais largo e mais transparente.
const SHOCK_DURATION = ${SHOCKWAVE_DURATION};
const SHOCK_QUAD = ${SHOCKWAVE_QUAD_SIZE.toFixed(1)};
@fragment
fn fs_shockwave(in: VertexOut) -> @location(0) vec4f {
  let tt = u.time / SHOCK_DURATION;
  let d = length(in.uv - vec2f(0.5, 0.4));
  // raio em unidades de mundo: 0.5 -> 3, desacelerando (ease-out); em uv divide pelo quad
  let r = (0.5 + 2.5 * (1.0 - (1.0 - tt) * (1.0 - tt))) / SHOCK_QUAD;
  let width = (0.06 + 0.12 * tt) / SHOCK_QUAD;
  let ring = 1.0 - smoothstep(0.0, width, abs(d - r));
  let a = ring * (1.0 - tt) * 0.3;    // branco translúcido: alpha 0.3 -> 0
  if (tt >= 1.0 || a < 0.01) {
    discard;
  }
  return vec4f(1.0, 1.0, 1.0, a);
}
`;
