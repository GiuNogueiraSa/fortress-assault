// ---------- Iluminação por pixel (todos os objetos opacos) ----------
// Luz direcional principal (Lambert) + especular Blinn-Phong + luz de
// preenchimento fraca + ambiente, variação de cor por ruído procedural e
// escurecimento barato das bordas (ângulo entre normal e câmera).
import { mat4 } from "./math.js";
import { NOISE_WGSL } from "./explosion.js";
import { MAX_HOLES } from "./trench.js";

// Materiais: quanto brilho especular, quão "duro" é o brilho, quanto ruído de
// cor e em que escala (frequência no espaço do objeto). emissive = sem luz.
export const MATERIALS = {
  metal:   { spec: 0.55, shininess: 48, noise: 0.10, noiseScale: 3.0, emissive: 0 },
  ground:  { spec: 0.04, shininess: 8,  noise: 0.16, noiseScale: 0.6, emissive: 0 },
  sandbag: { spec: 0.08, shininess: 12, noise: 0.14, noiseScale: 2.2, emissive: 0 },
  flash:   { spec: 0,    shininess: 1,  noise: 0,    noiseScale: 1,   emissive: 1 },
};

// Layout do uniform buffer por objeto (160 bytes):
//   mvp mat4 (0) | model mat4 (64) | material vec4 (128) | camPos+noiseScale vec4 (144)
export const OBJECT_UNIFORM_BYTES = 160;
export function objectUniformData(viewProj, model, material, camPos) {
  const d = new Float32Array(OBJECT_UNIFORM_BYTES / 4);
  d.set(mat4.multiply(viewProj, model), 0);
  d.set(model, 16);
  d.set([material.spec, material.shininess, material.noise, material.emissive], 32);
  d.set([camPos[0], camPos[1], camPos[2], material.noiseScale], 36);
  return d;
}
export const litShaderCode = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  material: vec4f,   // x: especular, y: brilho (expoente), z: ruído, w: emissivo
  camPos: vec4f,     // xyz: posição da câmera, w: escala do ruído
};
@group(0) @binding(0) var<uniform> u: Uniforms;

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
  // modelos só com rotação/translação/escala uniforme: a parte 3x3 serve para a normal
  out.normal = (u.model * vec4f(normal, 0.0)).xyz;
  out.color = color;
  out.localPos = pos;   // ruído preso ao objeto (não "escorre" quando o tanque anda)
  return out;
}

${NOISE_WGSL}

const LIGHT_DIR = vec3f(0.4, 1.0, 0.35);      // mesma direção da luz "falsa" antiga
const LIGHT_COLOR = vec3f(1.0, 0.96, 0.88);
const FILL_DIR = vec3f(-0.6, 0.35, -0.7);     // preenchimento vindo do lado oposto
const FILL_COLOR = vec3f(0.55, 0.65, 0.85);
const AMBIENT = 0.22;

// Iluminação comum a todos os objetos opacos, a partir da cor base
fn shade(in: VertexOut, baseColor: vec3f) -> vec3f {
  let V = normalize(u.camPos.xyz - in.worldPos);
  var N = normalize(in.normal);
  // cullMode "none" + modelo doubleSided: a normal deve apontar para a câmera
  if (dot(N, V) < 0.0) {
    N = -N;
  }
  let L = normalize(LIGHT_DIR);
  let F = normalize(FILL_DIR);

  // Variação sutil de cor: duas oitavas do gradient noise do shader de explosão
  let q = in.localPos * u.camPos.w;
  let n = 0.65 * noise(q) + 0.35 * noise(q * 4.0);
  let albedo = baseColor * (1.0 + u.material.z * n * 2.0);

  let diffuse = max(dot(N, L), 0.0);
  let fill = max(dot(N, F), 0.0);
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), u.material.y) * u.material.x * step(0.0, dot(N, L));

  // "Oclusão" barata: superfícies quase de perfil para a câmera (bordas) escurecem
  let edge = mix(0.72, 1.0, sqrt(max(dot(N, V), 0.0)));

  let lit = albedo * (AMBIENT + 0.85 * diffuse * LIGHT_COLOR + 0.25 * fill * FILL_COLOR) + spec * LIGHT_COLOR;
  return lit * edge;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  if (u.material.w > 0.5) {
    return vec4f(in.color, 1.0);   // emissivo (flash do tiro): sem iluminação
  }
  return vec4f(shade(in, in.color), 1.0);
}

// ---------- Trincheira: buracos recortados no fragment shader ----------
// Cada impacto = (x, y no plano do muro, raio, semente). O raio de corte de
// cada pixel é perturbado por ruído (o mesmo do shader de explosão), então a
// borda sai rasgada; dentro do corte o pixel é descartado (buraco vazado) e
// numa faixa logo fora dele a cor escurece (queimado).
struct Holes {
  count: vec4f,                          // x: quantos impactos valem
  items: array<vec4f, ${MAX_HOLES}>,     // xy: centro, z: raio, w: semente
};
@group(1) @binding(0) var<uniform> holes: Holes;

const BURN_COLOR = vec3f(0.08, 0.055, 0.04);
const BURN_WIDTH = 0.28;   // faixa de queimado fora do corte (unidades de mundo)

@fragment
fn fs_trench(in: VertexOut) -> @location(0) vec4f {
  let p = in.worldPos.xy;
  var edgeDist = 1e9;   // distância até a borda do corte mais próximo (negativa = dentro)
  let n = i32(holes.count.x);
  for (var i = 0; i < n; i++) {
    let h = holes.items[i];
    let d = distance(p, h.xy);
    if (d > h.z * 1.7 + BURN_WIDTH) {
      continue;          // longe: pula o ruído (economiza nos pixels do resto do muro)
    }
    // raio perturbado: onda larga (formato) + detalhe fino (rasgos)
    let q = vec3f(p * 2.2, h.w);
    let wobble = 0.55 * noise(q) + 0.30 * noise(q * 3.7 + 11.0);
    let cut = h.z * (1.0 + wobble);
    edgeDist = min(edgeDist, d - cut);
  }
  if (edgeDist < 0.0) {
    discard;             // dentro do buraco: a parede some aqui (vazado)
  }
  // queimado: forte colado na borda, some ao longo da faixa, com manchas de ruído
  let soot = noise(vec3f(p * 6.0, 3.0));
  let burn = (1.0 - smoothstep(0.0, BURN_WIDTH * (0.8 + 0.6 * soot), edgeDist)) * 0.92;
  let base = mix(in.color, BURN_COLOR, burn);
  return vec4f(shade(in, base), 1.0);
}
`;
