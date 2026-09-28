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

// Layout do uniform buffer (112 bytes). vec3f ocupa 16 bytes de alinhamento,
// por isso cada vec3f vem "colado" com um f32 para não sobrar buraco.
export const EXPLOSION_UNIFORM_BYTES = 112;
// Com repeat = 1 o ciclo do shader é de 2 s, mas medido na prática nada fica
// visível a partir de t ≈ 1.3 s — dá para parar de desenhar o quad aí.
export const EXPLOSION_DURATION = 1.3;

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

fn worley(s: vec3f) -> f32 {
  let si = floor(s);
  let sf = fract(s);
  var m_dist = 1.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      for (var z = -1; z <= 1; z++) {
        let neighbor = vec3f(f32(x), f32(y), f32(z));
        var pt = fract(n_rand3(si + neighbor));
        pt = 0.5 + 0.5 * sin(DISPERSE * u.time + 6.2831 * pt);
        let diff = neighbor + pt - sf;
        m_dist = min(m_dist, length(diff));
      }
    }
  }
  return m_dist;
}

fn boom(p: vec2f) -> f32 {
  let rep = max(glsl_mod(u.time * BOOM_REPEAT, 2.0), 0.001);
  let shape = 1.0 - dot(p, p) / (rep * BOOM_SHAPE) - rep * 2.0;
  let distortion = noise(vec3f(p * BOOM_DISTORTION, u.time * 0.5));
  let bubbles = BOOM_BUBBLES - pow(worley(vec3f(p * 1.2, u.time * 2.0)), 3.0);
  let effects = BOOM_BW * bubbles + (1.0 - BOOM_BW) * distortion;
  return shape + effects;
}

fn smoke(p: vec2f) -> f32 {
  let rep = max(glsl_mod(u.time * SMOKE_REPEAT, 2.0), 0.001);
  let rise = vec2f(0.0, 2.0) * pow(rep / 1.45, 2.0) * 1.5;   // fumaça sobe com o tempo
  let q = p - rise;
  let shape = 1.0 - dot(q, q) / (rep * SMOKE_SHAPE) - pow(rep * 1.5, 0.5);
  let distortion = noise(vec3f(p * SMOKE_DISTORTION - rise, u.time * 0.1));
  let rise2 = vec2f(0.0, 2.0) * pow(rep / 1.65, 2.0) * 1.5;
  let bubbles = SMOKE_BUBBLES - pow(worley(vec3f(p / pow(rep, 0.35) - rise2, u.time * 0.1)), 2.0);
  let effects = SMOKE_BW * bubbles + (1.0 - SMOKE_BW) * distortion;
  return shape + effects;
}

fn f(p: vec2f) -> f32 {
  return max(boom(p), smoke(p));
}

fn grad(x: vec2f) -> vec2f {
  let h = vec2f(0.01, 0.0);
  return vec2f(f(x + h.xy) - f(x - h.xy),
               f(x + h.yx) - f(x - h.yx)) / (2.0 * h.x);
}

// Contorno preto "cartoon": distância estimada até a borda da forma
fn border(uv: vec2f) -> f32 {
  let b = f(uv);
  let g = grad(uv);
  let de = abs(b) / length(g);
  let eps = 0.01;
  return smoothstep(1.0 * eps, 2.0 * eps, de);
}

fn posterize(v: f32, n: i32) -> f32 {
  let nf = f32(n);
  return floor(v * nf) / (nf - 1.0);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  var boom_pal = array<vec3f, 4>(
    vec3f(0.2, 0.15, 0.3), vec3f(0.9, 0.15, 0.05), vec3f(0.9, 0.5, 0.1), vec3f(0.95, 0.95, 0.35));
  var smoke_pal = array<vec3f, 3>(
    vec3f(0.2, 0.15, 0.3), vec3f(0.35, 0.3, 0.45), vec3f(0.5, 0.45, 0.6));

  let pos = (in.uv - vec2f(0.5, 0.4)) * SIZE;

  let boom_val = boom(pos);
  let boom_a = step(0.0, boom_val);
  let bi = clamp(i32(posterize(boom_val, 4) * 4.0), 0, 3);
  let boom_col = boom_pal[bi] - vec3f(1.0 - boom_a);

  let smoke_val = smoke(pos);
  let smoke_a = step(0.0, smoke_val);
  let si = clamp(i32(posterize(smoke_val, 3) * 3.0), 0, 2);
  let smoke_col = smoke_pal[si] - vec3f(1.0 - smoke_a);

  let b = step(1.0, border(pos));
  let bw = step(smoke_val * 1.25, boom_val);

  let color = bw * boom_col + (1.0 - bw) * smoke_col;
  let alpha = bw * boom_a + (1.0 - bw) * smoke_a;

  // alpha é sempre 0 ou 1: fora da explosão descarta; dentro, alpha == 1 e o
  // select(0.5, color, alpha == 1) do original vira só "color".
  if (alpha < 0.5) {
    discard;
  }
  return vec4f(color - vec3f(1.0 - b), 1.0);
}
`;
