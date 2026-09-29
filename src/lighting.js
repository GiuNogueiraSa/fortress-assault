// ---------- Iluminação por pixel (todos os objetos opacos) ----------
// Luz direcional principal (Lambert) + especular Blinn-Phong + luz de
// preenchimento fraca + ambiente, variação de cor por ruído procedural e
// escurecimento barato das bordas (ângulo entre normal e câmera).
import { mat4 } from "./math.js";
import { NOISE_WGSL } from "./explosion.js";

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

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  if (u.material.w > 0.5) {
    return vec4f(in.color, 1.0);   // emissivo (flash do tiro): sem iluminação
  }
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
  let albedo = in.color * (1.0 + u.material.z * n * 2.0);

  let diffuse = max(dot(N, L), 0.0);
  let fill = max(dot(N, F), 0.0);
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), u.material.y) * u.material.x * step(0.0, dot(N, L));

  // "Oclusão" barata: superfícies quase de perfil para a câmera (bordas) escurecem
  let edge = mix(0.72, 1.0, sqrt(max(dot(N, V), 0.0)));

  let lit = albedo * (AMBIENT + 0.85 * diffuse * LIGHT_COLOR + 0.25 * fill * FILL_COLOR) + spec * LIGHT_COLOR;
  return vec4f(lit * edge, 1.0);
}
`;
