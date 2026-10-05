// ---------- Iluminação por pixel (todos os objetos opacos) ----------
// Sol direcional quente com SOMBRAS (shadow map + PCF 3x3, sombras suaves),
// luz de preenchimento azul do céu, ambiente hemisférico, clarão da explosão
// (luz pontual rápida), névoa na distância e escurecimento de bordas.
// Padrões procedurais: onça com desgaste e metal com estrias (tanque), grama
// com ondulação e musgo (chão), e na fortaleza: alvenaria de pedras
// irregulares (Voronoi) com relevo na normal, hera, flores, sombra da
// passagem do portão e os buracos recortados. Dentro do pátio a luz é quente.
import { mat4 } from "./math.js";
import { NOISE_WGSL } from "./explosion.js";
import {
  MAX_HOLES, FORT_HEIGHT, COURTYARD, TOWERS, FRONT_Z, WALL_T, GATE_HALF_W, GATE_H, HOLE_STRETCH_Y,
} from "./trench.js";

// ---------- Sol ----------
// Azimute medido a partir de -Z (para onde o tanque olha no início), girando
// para +X. Sol baixo vindo de trás-esquerda: luz rasante na fachada (realça o
// relevo das pedras e as sombras das ameias) e sol visível no horizonte quando
// o tanque vira para a esquerda. Luz a 35° (para o sol entrar no pátio);
// disco desenhado quase no horizonte (a câmera só enxerga até ~1.5° acima dele).
const SUN_AZIMUTH = -110 * Math.PI / 180;
const sunDir = elevation => [
  Math.sin(SUN_AZIMUTH) * Math.cos(elevation),
  Math.sin(elevation),
  -Math.cos(SUN_AZIMUTH) * Math.cos(elevation),
];
export const SUN_LIGHT_DIR = sunDir(35 * Math.PI / 180);
export const SUN_DISC_DIR = sunDir(1.0 * Math.PI / 180);
export const HORIZON_COLOR = [1.0, 0.74, 0.46];
const f3 = v => v.map(x => x.toFixed(5)).join(", ");
const wgslVec3 = v => `vec3f(${f3(v)})`;

// Matriz da "câmera" do sol (ortográfica) cobrindo a cena, para o shadow map
export function sunViewProj() {
  const center = [0, 0, -8];
  const eye = center.map((c, k) => c + SUN_LIGHT_DIR[k] * 80);
  const view = mat4.lookAt(eye, center, [0, 1, 0]);
  return mat4.multiply(mat4.ortho(-30, 30, -30, 30, 1, 170), view);
}
export const SHADOW_MAP_SIZE = 2048;

// Materiais: especular, expoente, ruído de cor e escala, emissivo, padrão
// (0 nenhum, 1 tanque, 2 manchas, 3 grama) e rim (escurecimento das bordas).
export const MATERIALS = {
  tankPaint: { spec: 0.55, shininess: 40, noise: 0.06, noiseScale: 3.0, emissive: 0, pattern: 1, rim: 0.65 },
  metal:     { spec: 1.20, shininess: 96, noise: 0.08, noiseScale: 3.0, emissive: 0, pattern: 0, rim: 0.30 },
  ground:    { spec: 0.20, shininess: 40, noise: 0.00, noiseScale: 0.6, emissive: 0, pattern: 3, rim: 0.80 }, // orvalho
  stone:     { spec: 0.35, shininess: 28, noise: 0.00, noiseScale: 1.4, emissive: 0, pattern: 0, rim: 0.72 }, // pedra úmida
  rock:      { spec: 0.20, shininess: 20, noise: 0.12, noiseScale: 6.0, emissive: 0, pattern: 0, rim: 0.72 },
  foliage:   { spec: 0.08, shininess: 10, noise: 0.25, noiseScale: 1.2, emissive: 0, pattern: 0, rim: 0.60 },
  flash:     { spec: 0,    shininess: 1,  noise: 0,    noiseScale: 1,   emissive: 1, pattern: 0, rim: 1.00 },
};

// Uniform por objeto (192 bytes):
//   mvp (0) | model (64) | material (128) | camPos+noiseScale (144)
//   | extra (160): padrão, tinta rgb | look (176): rim, opacidade, dano (0..1)
export const OBJECT_UNIFORM_BYTES = 192;
export function objectUniformData(viewProj, model, material, camPos, tint = [1, 1, 1], pattern = material.pattern, opacity = 1, damage = 0) {
  const d = new Float32Array(OBJECT_UNIFORM_BYTES / 4);
  d.set(mat4.multiply(viewProj, model), 0);
  d.set(model, 16);
  d.set([material.spec, material.shininess, material.noise, material.emissive], 32);
  d.set([camPos[0], camPos[1], camPos[2], material.noiseScale], 36);
  d.set([pattern, tint[0], tint[1], tint[2]], 40);
  d.set([material.rim, opacity, damage, 0], 44);
  return d;
}

// Uniform da cena (grupo 1): matriz do sol, clarão da explosão e parâmetros
export const SCENE_UNIFORM_BYTES = 96;
export function sceneUniformData(lightVP, flashPos, flashIntensity, castleScale = 1, ivyBoost = 0, yardGlow = 0) {
  const d = new Float32Array(SCENE_UNIFORM_BYTES / 4);
  d.set(lightVP, 0);
  d.set([flashPos[0], flashPos[1], flashPos[2], flashIntensity], 16);
  d.set([1 / SHADOW_MAP_SIZE, castleScale, ivyBoost, yardGlow], 20);
  return d;
}

const OBJECT_STRUCT = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  material: vec4f,   // x: especular, y: expoente, z: ruído, w: emissivo
  camPos: vec4f,     // xyz: câmera, w: escala do ruído
  extra: vec4f,      // x: padrão, yzw: tinta
  look: vec4f,       // x: rim, y: opacidade, z: dano (marcas de queimado no tanque)
};
@group(0) @binding(0) var<uniform> u: Uniforms;
`;

// Teste dos buracos da fortaleza (usado no shader de cor E no de sombra, para
// os buracos também deixarem passar luz)
const HOLES_WGSL = /* wgsl */ `
struct Holes {
  count: vec4f,
  items: array<vec4f, ${2 * MAX_HOLES}>,   // [2i]: centro xyz, raio; [2i+1]: direção xyz, meio-comprimento
};
@group(2) @binding(0) var<uniform> holes: Holes;
const BURN_WIDTH = 0.28;
// distância até a borda do buraco mais próximo (negativa = dentro do buraco).
// Cada buraco é um cilindro ao longo da direção do tiro: vale em qualquer
// parede, de qualquer lado, e atravessa a espessura dela.
fn holeEdge(wp: vec3f) -> f32 {
  var edgeDist = 1e9;
  let n = i32(holes.count.x);
  for (var i = 0; i < n; i++) {
    let h = holes.items[2 * i];
    let ax = holes.items[2 * i + 1];
    let v = wp - h.xyz;
    let t = dot(v, ax.xyz);
    if (abs(t) > ax.w + 0.05) {
      continue;          // antes/depois do cilindro (ex.: a parede do fundo)
    }
    let vp = v - t * ax.xyz;                                   // eixo é horizontal
    let dist = length(vec3f(vp.x, vp.y / ${HOLE_STRETCH_Y.toFixed(2)}, vp.z));   // oval em pé
    if (dist > h.w * 1.7 + BURN_WIDTH) {
      continue;          // longe: pula o ruído
    }
    let q = wp * 2.2 + h.xyz * 7.0;    // semente: a posição do próprio buraco
    let wobble = 0.55 * noise(q) + 0.30 * noise(q * 3.7 + 11.0);
    edgeDist = min(edgeDist, dist - h.w * (1.0 + wobble));
  }
  return edgeDist;
}
`;

const TOWERS_WGSL = TOWERS.map((t, i) => `const TOWER${i} = vec3f(${t.x.toFixed(3)}, ${t.z.toFixed(3)}, ${t.r.toFixed(3)});`).join("\n");

export const litShaderCode = /* wgsl */ `
${OBJECT_STRUCT}
struct Scene {
  lightVP: mat4x4f,
  flash: vec4f,      // xyz: posição do clarão, w: intensidade
  params: vec4f,     // x: texel do shadow map, y: escala do castelo, z: reforço de hera, w: brilho do pátio (vitória)
};
@group(1) @binding(0) var<uniform> scene: Scene;
@group(1) @binding(1) var shadowMap: texture_depth_2d;
@group(1) @binding(2) var shadowSampler: sampler_comparison;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) localPos: vec3f,
};

@vertex
fn vs_main(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f) -> VertexOut {
  var out: VertexOut;
  out.position = u.mvp * vec4f(pos, 1.0);
  out.worldPos = (u.model * vec4f(pos, 1.0)).xyz;
  out.normal = (u.model * vec4f(normal, 0.0)).xyz;
  out.color = color;
  out.localPos = pos;
  return out;
}

${NOISE_WGSL}

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
// Value noise 2D barato (4 hashes), saída -0.5..0.5
fn vnoise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), w.x),
             mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), w.x), w.y) - 0.5;
}

const LIGHT_DIR = ${wgslVec3(SUN_LIGHT_DIR)};
const LIGHT_COLOR = vec3f(1.0, 0.9, 0.7);        // sol quente
const FILL_DIR = vec3f(0.15, 1.0, 0.25);         // céu: vem de cima (luz espalhada)
const FILL_COLOR = vec3f(0.3, 0.4, 0.6);         // azul claro
const FILL_STRENGTH = 0.85;
const SKY_AMBIENT = vec3f(0.22, 0.28, 0.38);
const GROUND_AMBIENT = vec3f(0.12, 0.15, 0.11);
const FLASH_COLOR = vec3f(1.0, 0.72, 0.32);
const FOG_COLOR = ${wgslVec3(HORIZON_COLOR)};
const FOG_START = 26.0;
const FOG_END = 75.0;
const YARD_MIN = vec2f(${COURTYARD.xMin.toFixed(2)}, ${COURTYARD.zMin.toFixed(2)});
const YARD_MAX = vec2f(${COURTYARD.xMax.toFixed(2)}, ${COURTYARD.zMax.toFixed(2)});
const YARD_AMBIENT = vec3f(1.0, 0.88, 0.58);
const YARD_LIGHT = vec3f(1.0, 0.90, 0.62);

fn yardWarmth(p: vec3f) -> f32 {
  let lo = YARD_MIN - vec2f(0.4);
  let hi = YARD_MAX + vec2f(0.4);
  let inX = smoothstep(lo.x - 0.15, lo.x + 0.15, p.x) * (1.0 - smoothstep(hi.x - 0.15, hi.x + 0.15, p.x));
  let inZ = smoothstep(lo.y - 0.15, lo.y + 0.15, p.z) * (1.0 - smoothstep(hi.y - 0.15, hi.y + 0.15, p.z));
  return inX * inZ;
}

// Sombra do sol: compara a profundidade vista pelo sol (PCF 3x3 = borda suave)
fn sunShadow(wp: vec3f, N: vec3f) -> f32 {
  let lp = scene.lightVP * vec4f(wp + N * 0.05, 1.0);   // desloca na normal: evita "acne"
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || lp.z > 1.0) {
    return 1.0;
  }
  let t = scene.params.x * 1.5;
  var s = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      s += textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2f(f32(x), f32(y)) * t, lp.z - 0.0008);
    }
  }
  return s / 9.0;
}

// Iluminação comum: normal, especular e rim por pixel
fn shadeFull(in: VertexOut, baseColor: vec3f, normalIn: vec3f, specK: f32, shin: f32, rim: f32) -> vec3f {
  let V = normalize(u.camPos.xyz - in.worldPos);
  var N = normalize(normalIn);
  if (dot(N, V) < 0.0) {
    N = -N;
  }
  let L = normalize(LIGHT_DIR);
  let F = normalize(FILL_DIR);
  var albedo = baseColor;
  if (u.material.z > 0.0) {
    let q = in.localPos * u.camPos.w;
    let n = 0.65 * noise(q) + 0.35 * noise(q * 4.0);
    albedo = baseColor * (1.0 + u.material.z * n * 2.0);
  }
  let shadow = sunShadow(in.worldPos, N);
  let diffuse = max(dot(N, L), 0.0) * shadow;
  let fill = max(dot(N, F), 0.0) * 0.6 + 0.4;   // céu ilumina quase tudo, mais por cima
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), shin) * specK * step(0.0, dot(N, L)) * shadow;
  let warm = yardWarmth(in.worldPos / scene.params.y);   // pátio na escala do castelo
  // no pátio: luz ambiente quente e forte (claro mesmo onde a sombra das muralhas cai)
  let ambient = mix(mix(GROUND_AMBIENT, SKY_AMBIENT, 0.5 + 0.5 * N.y), YARD_AMBIENT * (0.9 + 0.9 * scene.params.w), warm);
  let sunCol = mix(LIGHT_COLOR, YARD_LIGHT * 1.3, warm);
  // clarão da explosão: luz pontual laranja que some em ~0.12 s
  let toF = scene.flash.xyz - in.worldPos;
  let dF = length(toF);
  let flash = FLASH_COLOR * scene.flash.w * max(dot(N, toF / max(dF, 0.001)), 0.0) / (1.0 + 0.06 * dF * dF);
  let edge = mix(rim, 1.0, sqrt(max(dot(N, V), 0.0)));
  let lit = albedo * (ambient + 0.95 * diffuse * sunCol + FILL_STRENGTH * fill * FILL_COLOR + flash) + spec * sunCol;
  let fog = smoothstep(FOG_START, FOG_END, distance(u.camPos.xyz, in.worldPos)) * 0.6;
  return mix(lit * edge, FOG_COLOR, fog);
}
fn shadeN(in: VertexOut, baseColor: vec3f, normalIn: vec3f) -> vec3f {
  return shadeFull(in, baseColor, normalIn, u.material.x, u.material.y, u.look.x);
}
fn shade(in: VertexOut, baseColor: vec3f) -> vec3f {
  return shadeN(in, baseColor, in.normal);
}

// Voronoi F1 3D (pontos vindos de n_rand3, como o worley() da explosão)
fn cellF1(p: vec3f) -> f32 {
  let ip = floor(p);
  let fp = fract(p);
  var best = 9.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let o = vec3f(f32(x), f32(y), f32(z));
        let pt = fract(n_rand3(ip + o));
        best = min(best, length(o + pt - fp));
      }
    }
  }
  return best;
}

// Onça: pintas PRETAS lisas (círculos/ovais), uma em parte das células de
// Voronoi (id sorteado), borda nítida. ~18 no casco e ~10 na torre.
const JAGUAR_SPOT = vec3f(0.08, 0.08, 0.08);
fn cellSpot(p: vec3f) -> vec2f {   // x: distância ao ponto da célula, y: id da célula
  let ip = floor(p);
  let fp = fract(p);
  var best = 9.0;
  var id = 0.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let o = vec3f(f32(x), f32(y), f32(z));
        let c = ip + o;
        let pt = 0.25 + 0.5 * fract(n_rand3(c));
        let d = length((o + pt - fp) * vec3f(1.0, 1.25, 1.0));   // levemente oval
        if (d < best) {
          best = d;
          id = fract(sin(dot(c, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
        }
      }
    }
  }
  return vec2f(best, id);
}
fn jaguar(base: vec3f, p: vec3f) -> vec3f {
  let c = cellSpot(p * 2.6);
  let spot = (1.0 - smoothstep(0.24, 0.27, c.x)) * step(0.3, c.y);
  return mix(base, JAGUAR_SPOT, spot);
}
// Marcas de dano no tanque: manchas queimadas que crescem com o dano (0..1)
fn damageMarks(base: vec3f, p: vec3f, dmg: f32) -> vec3f {
  if (dmg <= 0.0) {
    return base;
  }
  let k = noise(p * 3.2 + 5.0) + 0.35 * noise(p * 9.0 + 1.0);
  // ~10% da superfície com 20% de dano, ~60% perto de explodir
  let burnt = smoothstep(0.62 - dmg * 0.9, 0.56 - dmg * 0.9, -k);
  return mix(base, vec3f(0.03, 0.025, 0.02), burnt * 0.92);
}
fn wear(base: vec3f, p: vec3f) -> vec3f {
  let w = noise(p * 5.0) + 0.5 * noise(p * 17.0);
  let dirt = smoothstep(0.15, 0.55, w) * (0.10 + 0.20 * (1.0 - smoothstep(0.0, 0.8, p.y)));
  let scuff = smoothstep(0.35, 0.6, noise(p * 9.0 + 3.0)) * 0.12;
  return base * (1.0 - dirt) * (1.0 + scuff);
}

// Chão: grama com variação clara/escura, fiapos finos, ondulação (só na
// normal), manchas de musgo e escurecimento de contato perto da fortaleza
const MOSS = vec3f(0.05, 0.12, 0.05);
const GRASS_LIGHT = vec3f(0.22, 0.36, 0.16);
${TOWERS_WGSL}
fn fortressDist(p: vec2f) -> f32 {
  let q = abs(p - vec2f(0.0, -13.0)) - vec2f(10.0, 4.6);   // retângulo das muralhas
  var d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
  d = min(d, distance(p, TOWER0.xy) - TOWER0.z);
  d = min(d, distance(p, TOWER1.xy) - TOWER1.z);
  return d;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  if (u.material.w > 0.5) {
    return vec4f(in.color, 1.0);   // emissivo (flash do tiro)
  }
  var base = in.color * u.extra.yzw;
  let pat = u.extra.x;
  if (pat > 0.5 && pat < 1.5) {
    // tanque: onça + desgaste nas partes amarelas; nas escuras, metal com estrias
    if (in.color.r > 0.5) {
      base = damageMarks(wear(jaguar(base, in.localPos), in.localPos), in.localPos, u.look.z);
    } else {
      let lp = in.localPos;
      let g = fract(lp.z * 13.0);
      let groove = smoothstep(0.0, 0.12, g) * smoothstep(0.62, 0.5, g);
      let cavity = select(1.0, mix(0.35, 1.0, groove), abs(lp.x) > 0.36);
      let dmgBase = damageMarks(base * cavity, lp, u.look.z);
      return vec4f(shadeFull(in, dmgBase, in.normal, 0.9 * cavity, 64.0, 0.35), 1.0);
    }
  } else if (pat > 1.5 && pat < 2.5) {
    let m = smoothstep(0.05, 0.3, noise(in.localPos * 9.0 + u.extra.yzw * 7.0));
    base = base * (1.0 - 0.55 * m);
  } else if (pat > 2.5) {
    let xz = in.worldPos.xz;
    let n1 = vnoise2(xz * 0.35);
    let n2 = vnoise2(xz * 1.7 + 5.0);
    let blades = vnoise2(xz * vec2f(22.0, 9.0));
    base = mix(base, GRASS_LIGHT, clamp(0.5 + n1 * 0.9, 0.0, 1.0)) * (0.9 + 0.35 * n2 + 0.18 * blades);
    let moss = smoothstep(0.24, 0.36, vnoise2(xz * 0.45 + 40.0) + 0.35 * vnoise2(xz * 2.1));
    base = mix(base, MOSS, moss * 0.6);
    // abs: dentro do pátio a distância é negativa; o escurecimento fica só junto às paredes
    let contact = mix(0.45, 1.0, smoothstep(0.0, 3.0, abs(fortressDist(xz / scene.params.y) * scene.params.y)));
    base = base * contact;
    let tilt = vec3f(vnoise2(xz * 2.3 + 7.0), 0.0, vnoise2(xz * 2.3 + 13.0)) * 0.35;
    return vec4f(shadeN(in, base, normalize(in.normal + tilt)), 1.0);
  }
  return vec4f(shade(in, base), u.look.y);
}

${HOLES_WGSL}

// ---------- Fortaleza ----------
const WALL_H = ${FORT_HEIGHT.toFixed(3)};
const MORTAR = vec3f(0.05, 0.09, 0.20);
const IVY = vec3f(0.05, 0.25, 0.08);
const IVY_LIGHT = vec3f(0.08, 0.36, 0.11);
const RED = vec3f(0.85, 0.05, 0.12);      // vermelho intenso (flores grandes)
const PINK = vec3f(0.92, 0.25, 0.45);
const YELLOW = vec3f(0.98, 0.92, 0.05);   // amarelo intenso (flores pequenas)
const BURN_COLOR = vec3f(0.01, 0.012, 0.02);
const GATE = vec4f(${GATE_HALF_W.toFixed(3)}, ${GATE_H.toFixed(3)}, ${(FRONT_Z - WALL_T).toFixed(3)}, ${FRONT_Z.toFixed(3)});

// Pedras irregulares: Voronoi 2D (F1 e F2). x: borda (F2-F1, pequeno = junta),
// yz: vetor do centro da pedra até o pixel (para o "abaulado"), w: id da pedra
fn stones(p: vec2f) -> vec4f {
  let ip = floor(p);
  let fp = fract(p);
  var f1 = 9.0;
  var f2 = 9.0;
  var toC = vec2f(0.0);
  var id = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let o = vec2f(f32(x), f32(y));
      let c = ip + o;
      let pt = o + 0.15 + 0.7 * vec2f(hash2(c), hash2(c + 23.7));
      let d = distance(fp, pt);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        toC = fp - pt;
        id = hash2(c + 5.1);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return vec4f(f2 - f1, toC, id);
}

@fragment
fn fs_trench(in: VertexOut) -> @location(0) vec4f {
  // tudo do castelo em coordenadas LOCAIS (castelo base): a escala da missão
  // está só na matriz de modelo, então pedras, buracos e portão não mudam
  let edgeDist = holeEdge(in.localPos);
  if (edgeDist < 0.0) {
    discard;
  }
  if (in.color.r > 0.5) {   // detalhes amarelos do portão: sem padrões
    return vec4f(shadeFull(in, in.color, in.normal, 0.8, 60.0, 0.5), 1.0);
  }
  let wp = in.localPos;
  let N0 = normalize(in.normal);

  // coordenadas da superfície: torres (cilíndricas) usam ângulo x altura;
  // o resto usa o eixo dominante da normal
  var uv = wp.xy;
  var T = vec3f(1.0, 0.0, 0.0);
  var B = vec3f(0.0, 1.0, 0.0);
  var nearTower = 0.0;
  var onTower = false;
  for (var i = 0; i < 2; i++) {
    let tw = select(TOWER0, TOWER1, i == 1);
    let rel = wp.xz - tw.xy;
    let dT = length(rel);
    nearTower = max(nearTower, 1.0 - smoothstep(tw.z, tw.z + 2.5, dT));
    if (dT < tw.z + 0.3 && abs(N0.y) < 0.5) {
      let a = atan2(rel.y, rel.x);
      uv = vec2f(a * tw.z, wp.y);
      T = vec3f(-sin(a), 0.0, cos(a));
      onTower = true;
    }
  }
  if (!onTower) {
    let an = abs(N0);
    if (an.x > an.z && an.x > an.y) {
      uv = vec2f(wp.z, wp.y);
      T = vec3f(0.0, 0.0, 1.0);
    } else if (an.y > an.z) {
      uv = wp.xz;
      B = vec3f(0.0, 0.0, 1.0);
    }
  }

  // alvenaria: pedras irregulares mais largas que altas, juntas escuras,
  // pedras abauladas (a normal inclina para fora do centro de cada pedra)
  let st = stones(uv * vec2f(1.7, 2.8));
  let mortar = 1.0 - smoothstep(0.03, 0.10, st.x);
  let bulge = st.yz * (1.0 - mortar) * 0.9;
  let rough = vec2f(vnoise2(uv * 9.0), vnoise2(uv * 9.0 + 19.3));
  var Nb = normalize(N0 + bulge.x * T + bulge.y * B + 0.18 * (rough.x * T + rough.y * B));
  var base = in.color * (0.82 + 0.32 * st.w) * (0.92 + 0.15 * vnoise2(uv * 3.0));
  base = mix(base, MORTAR, mortar);

  // hera: manchas verticais, mais densa embaixo, nas torres e nos cantos
  let h01 = clamp(wp.y / (WALL_H + 3.0), 0.0, 1.0);
  let corner = 1.0 - smoothstep(0.0, 3.0, 10.0 - abs(wp.x));
  let boost = max(nearTower, corner) * 0.12;
  let ivyN = vnoise2(vec2f(uv.x * 0.9, uv.y * 0.35) + 3.1) + 0.45 * vnoise2(uv * 2.6 + 7.7)
           + 0.25 * vnoise2(uv * 9.0 + 1.3);
  let ivy = smoothstep(-0.02, 0.06, ivyN - mix(-0.05, 0.31, h01) + boost + scene.params.z);
  if (ivy > 0.01) {
    let leaf = vnoise2(uv * 14.0 + 5.0);
    let ivyCol = mix(IVY, IVY_LIGHT, smoothstep(-0.2, 0.4, leaf));
    let leafN = vec2f(vnoise2(uv * 12.0 + 2.0), vnoise2(uv * 12.0 + 9.0));
    Nb = normalize(mix(Nb, normalize(N0 + 0.6 * (leafN.x * T + leafN.y * B)), ivy));
    base = mix(base, ivyCol, ivy);
    // flores em ~12% da hera: vermelhas grandes, rosas médias, amarelas pequenas
    let cell = floor(uv * 3.2);
    let fr = fract(uv * 3.2);
    let dF = distance(fr, 0.25 + 0.5 * vec2f(hash2(cell), hash2(cell + 17.0)));
    let pick = hash2(cell + 31.0);
    let isYellow = pick > 0.72;
    let isPink = pick > 0.45 && !isYellow;
    let radius = select(select(0.22, 0.17, isPink), 0.11, isYellow);
    let flower = (1.0 - smoothstep(radius - 0.03, radius + 0.02, dF)) * ivy;
    let petal = select(select(RED, PINK, isPink), YELLOW, isYellow);
    // miolo amarelo nas vermelhas/rosas (detalhe de flor)
    let core = (1.0 - smoothstep(0.03, 0.05, dF)) * select(1.0, 0.0, isYellow);
    base = mix(mix(base, petal, flower), YELLOW, core * flower);
  }

  // passagem do portão: escurece para o meio da espessura (sombra de profundidade)
  var tunnel = 1.0;
  if (abs(wp.x) < GATE.x + 0.05 && wp.y < GATE.y + 0.05 && wp.z > GATE.z - 0.02 && wp.z < GATE.w + 0.02) {
    let depthIn = min(wp.z - GATE.z, GATE.w - wp.z);
    tunnel = mix(1.0, 0.18, smoothstep(0.0, 0.5, depthIn));
  }

  if (edgeDist < BURN_WIDTH * 1.5) {
    let soot = vnoise2(wp.xy * 6.0 + 3.0);
    let burn = (1.0 - smoothstep(0.0, BURN_WIDTH * (0.8 + 0.6 * soot), edgeDist)) * 0.92;
    base = mix(base, BURN_COLOR, burn);
  }
  return vec4f(shadeN(in, base, Nb) * tunnel, 1.0);
}
`;

// ---------- Passagem de sombra (profundidade vista do sol) ----------
export const shadowShaderCode = /* wgsl */ `
${OBJECT_STRUCT}
struct Light { viewProj: mat4x4f };
@group(1) @binding(0) var<uniform> light: Light;
struct SOut {
  @builtin(position) position: vec4f,
  @location(0) localPos: vec3f,
};
@vertex
fn vs_shadow(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) color: vec3f) -> SOut {
  var out: SOut;
  let wp = (u.model * vec4f(pos, 1.0)).xyz;
  out.position = light.viewProj * vec4f(wp, 1.0);
  out.localPos = pos;
  return out;
}
${NOISE_WGSL}
${HOLES_WGSL}
// fortaleza: buracos não fazem sombra (a luz passa por eles)
@fragment
fn fs_shadow_trench(in: SOut) {
  if (holeEdge(in.localPos) < 0.0) {
    discard;
  }
}
`;
