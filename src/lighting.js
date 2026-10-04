// ---------- Iluminação por pixel (todos os objetos opacos) ----------
// Luz do sol (Lambert + especular Blinn-Phong), luz de preenchimento,
// ambiente "hemisférico" (céu em cima, chão embaixo), variação de cor por
// ruído, escurecimento das bordas e névoa leve na distância (cor do horizonte).
// Padrões procedurais por material: estampa de onça (tanque), manchas
// (destroços) e, na trincheira, blocos de concreto com relevo falso, franja
// vinho, "algas" verdes e os buracos recortados.
import { mat4 } from "./math.js";
import { NOISE_WGSL } from "./explosion.js";
import { MAX_HOLES, TRENCH_HEIGHT, TRENCH_WIDTH } from "./trench.js";

// ---------- Sol ----------
// Azimute medido a partir de -Z (para onde o tanque olha no início), girando
// para +X. O disco do sol é desenhado baixo, quase no horizonte, porque a
// câmera olha para baixo (~20°) e, nesse azimute, só enxerga até ~1.5° acima dele. A luz usa o
// MESMO azimute, mas mais alta, para iluminar o topo das coisas.
// à esquerda do paredão (que cobre ±14°); à direita o painel de controles do HUD o esconderia
const SUN_AZIMUTH = -22 * Math.PI / 180;
const sunDir = elevation => [
  Math.sin(SUN_AZIMUTH) * Math.cos(elevation),
  Math.sin(elevation),
  -Math.cos(SUN_AZIMUTH) * Math.cos(elevation),
];
export const SUN_LIGHT_DIR = sunDir(30 * Math.PI / 180);   // usada na iluminação
export const SUN_DISC_DIR = sunDir(0.5 * Math.PI / 180);   // usada para desenhar o sol (sky.js)
export const HORIZON_COLOR = [1.0, 0.74, 0.46];            // céu no horizonte = cor da névoa
const wgslVec3 = v => `vec3f(${v.map(x => x.toFixed(5)).join(", ")})`;

// Materiais: brilho especular, expoente do brilho, quanto ruído de cor e em
// que escala, emissivo (sem luz) e padrão procedural (0 nenhum, 1 onça, 2 manchas).
export const MATERIALS = {
  tankPaint: { spec: 0.55, shininess: 40, noise: 0.06, noiseScale: 3.0, emissive: 0, pattern: 1 },
  metal:     { spec: 0.55, shininess: 48, noise: 0.10, noiseScale: 3.0, emissive: 0, pattern: 0 },
  ground:    { spec: 0.14, shininess: 18, noise: 0.16, noiseScale: 0.6, emissive: 0, pattern: 0 }, // brilho do sol no chão
  concrete:  { spec: 0.14, shininess: 22, noise: 0.10, noiseScale: 1.4, emissive: 0, pattern: 0 },
  rock:      { spec: 0.10, shininess: 14, noise: 0.12, noiseScale: 6.0, emissive: 0, pattern: 0 },
  flash:     { spec: 0,    shininess: 1,  noise: 0,    noiseScale: 1,   emissive: 1, pattern: 0 },
};

// Layout do uniform buffer por objeto (176 bytes):
//   mvp mat4 (0) | model mat4 (64) | material vec4 (128) | camPos+noiseScale vec4 (144)
//   | extra vec4 (160): x = padrão, yzw = tinta (multiplica a cor base)
export const OBJECT_UNIFORM_BYTES = 176;
export function objectUniformData(viewProj, model, material, camPos, tint = [1, 1, 1], pattern = material.pattern) {
  const d = new Float32Array(OBJECT_UNIFORM_BYTES / 4);
  d.set(mat4.multiply(viewProj, model), 0);
  d.set(model, 16);
  d.set([material.spec, material.shininess, material.noise, material.emissive], 32);
  d.set([camPos[0], camPos[1], camPos[2], material.noiseScale], 36);
  d.set([pattern, tint[0], tint[1], tint[2]], 40);
  return d;
}

export const litShaderCode = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  material: vec4f,   // x: especular, y: brilho (expoente), z: ruído, w: emissivo
  camPos: vec4f,     // xyz: posição da câmera, w: escala do ruído
  extra: vec4f,      // x: padrão (0 nenhum, 1 onça, 2 manchas), yzw: tinta
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
  out.localPos = pos;   // padrões presos ao objeto (não "escorrem" quando o tanque anda)
  return out;
}

${NOISE_WGSL}

const LIGHT_DIR = ${wgslVec3(SUN_LIGHT_DIR)};
const LIGHT_COLOR = vec3f(1.0, 0.90, 0.74);      // sol de fim de tarde
const FILL_DIR = vec3f(-0.35, 0.55, 0.75);       // preenchimento do lado da câmera
const FILL_COLOR = vec3f(0.55, 0.65, 0.85);
const FILL_STRENGTH = 0.60;   // a frente do paredão fica contra o sol: o preenchimento a ilumina
const SKY_AMBIENT = vec3f(0.40, 0.46, 0.56);     // ambiente vindo de cima (céu)
const GROUND_AMBIENT = vec3f(0.20, 0.18, 0.14);  // ambiente vindo de baixo (chão)
const FOG_COLOR = ${wgslVec3(HORIZON_COLOR)};
const FOG_START = 16.0;
const FOG_END = 45.0;

// Iluminação comum a todos os opacos, com uma normal dada (permite relevo falso)
fn shadeN(in: VertexOut, baseColor: vec3f, normalIn: vec3f) -> vec3f {
  let V = normalize(u.camPos.xyz - in.worldPos);
  var N = normalize(normalIn);
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
  let ambient = mix(GROUND_AMBIENT, SKY_AMBIENT, 0.5 + 0.5 * N.y);

  // "Oclusão" barata: superfícies quase de perfil para a câmera (bordas) escurecem
  let edge = mix(0.72, 1.0, sqrt(max(dot(N, V), 0.0)));

  let lit = albedo * (ambient + 0.85 * diffuse * LIGHT_COLOR + FILL_STRENGTH * fill * FILL_COLOR) + spec * LIGHT_COLOR;
  // névoa leve na distância, na cor do horizonte: integra o chão com o céu
  let fog = smoothstep(FOG_START, FOG_END, distance(u.camPos.xyz, in.worldPos)) * 0.65;
  return mix(lit * edge, FOG_COLOR, fog);
}
fn shade(in: VertexOut, baseColor: vec3f) -> vec3f {
  return shadeN(in, baseColor, in.normal);
}

// Distância até o ponto de célula mais próximo (Voronoi/Worley F1), no mesmo
// estilo do worley() do shader de explosão (pontos vindos de n_rand3).
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

// Estampa de onça: rosetas (anel escuro irregular com miolo um pouco mais
// escuro que o fundo) a partir de células de Voronoi com borda perturbada por ruído.
const JAGUAR_SPOT = vec3f(0.40, 0.20, 0.05);
fn jaguar(base: vec3f, p: vec3f) -> vec3f {
  let q = p * 3.4;   // células de ~0.3: manchas grandes como as de onça
  let d = cellF1(q) + 0.10 * noise(q * 2.3);
  let ring = smoothstep(0.30, 0.25, d) * smoothstep(0.08, 0.13, d);   // anel da roseta
  let core = smoothstep(0.13, 0.08, d);                                // miolo
  let c = mix(base, base * vec3f(0.85, 0.62, 0.35), core * 0.8);
  return mix(c, JAGUAR_SPOT, ring);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  if (u.material.w > 0.5) {
    return vec4f(in.color, 1.0);   // emissivo (flash do tiro): sem iluminação
  }
  var base = in.color * u.extra.yzw;
  // onça só nas partes amarelas (cano/esteiras escuros ficam lisos)
  if (u.extra.x > 0.5 && u.extra.x < 1.5 && in.color.r > 0.5) {
    base = jaguar(base, in.localPos);
  }
  // manchas: material heterogêneo (destroços)
  if (u.extra.x > 1.5) {
    let m = smoothstep(0.05, 0.3, noise(in.localPos * 9.0 + u.extra.yzw * 7.0));
    base = base * (1.0 - 0.55 * m);
  }
  return vec4f(shade(in, base), 1.0);
}

// ---------- Trincheira (paredão) ----------
// Buracos: cada impacto = (x, y no plano do muro, raio, semente). O raio de
// corte de cada pixel é perturbado por ruído, então a borda sai rasgada;
// dentro do corte o pixel é descartado (buraco vazado) e numa faixa logo fora
// dele a cor escurece (queimado).
// Superfície: blocos de concreto em fiada (juntas escuras e bordas chanfradas
// só na NORMAL, sem geometria extra), tom diferente por bloco, franja vinho no
// topo e nas pontas e "algas" verdes em manchas orgânicas perto da base.
struct Holes {
  count: vec4f,                          // x: quantos impactos valem
  items: array<vec4f, ${MAX_HOLES}>,     // xy: centro, z: raio, w: semente
};
@group(1) @binding(0) var<uniform> holes: Holes;

const BURN_COLOR = vec3f(0.06, 0.045, 0.04);
const BURN_WIDTH = 0.28;
const WALL_H = ${TRENCH_HEIGHT.toFixed(3)};
const WALL_HALF_W = ${(TRENCH_WIDTH / 2).toFixed(3)};
const BLOCK = vec2f(0.9, 0.45);                  // tamanho de um bloco de concreto
const MORTAR_COLOR = vec3f(0.035, 0.05, 0.12);
const WINE = vec3f(0.50, 0.08, 0.15);
const ALGAE = vec3f(0.05, 0.20, 0.08);

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

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
    let q = vec3f(p * 2.2, h.w);
    let wobble = 0.55 * noise(q) + 0.30 * noise(q * 3.7 + 11.0);
    edgeDist = min(edgeDist, d - h.z * (1.0 + wobble));
  }
  if (edgeDist < 0.0) {
    discard;             // dentro do buraco: a parede some aqui (vazado)
  }

  // Coordenadas da face e eixos tangentes (frente/trás, laterais ou topo)
  let N0 = normalize(in.normal);
  var uv = in.worldPos.xy;
  var T = vec3f(1.0, 0.0, 0.0);
  var B = vec3f(0.0, 1.0, 0.0);
  if (abs(N0.x) > 0.5) {
    uv = vec2f(in.worldPos.z, in.worldPos.y);
    T = vec3f(0.0, 0.0, 1.0);
  } else if (abs(N0.y) > 0.5) {
    uv = in.worldPos.xz;
    B = vec3f(0.0, 0.0, 1.0);
  }

  // Blocos em fiada: linhas ímpares deslocadas meio bloco
  let row = floor(uv.y / BLOCK.y);
  let shifted = vec2f(uv.x + 0.5 * BLOCK.x * (row % 2.0), uv.y);
  let id = floor(shifted / BLOCK);
  let f = fract(shifted / BLOCK);
  let ex = min(f.x, 1.0 - f.x) * BLOCK.x;          // distância (mundo) até a junta
  let ey = min(f.y, 1.0 - f.y) * BLOCK.y;
  let mortar = 1.0 - smoothstep(0.012, 0.035, min(ex, ey));
  // chanfro: perto da junta a normal inclina para ela (relevo só na luz)
  let bevel = 0.07;
  let tx = select(1.0, -1.0, f.x < 0.5) * (1.0 - smoothstep(0.0, bevel, ex));
  let ty = select(1.0, -1.0, f.y < 0.5) * (1.0 - smoothstep(0.0, bevel, ey));
  // rugosidade do concreto
  let rough = vec2f(noise(vec3f(uv * 7.0, 1.0)), noise(vec3f(uv * 7.0, 5.0)));
  let Nb = normalize(N0 + 0.55 * (tx * T + ty * B) + 0.22 * (rough.x * T + rough.y * B));

  var base = in.color * (0.82 + 0.3 * hash2(id));   // tom diferente por bloco
  base = mix(base, MORTAR_COLOR, mortar);

  // "algas"/ferrugem verde: manchas orgânicas, mais frequentes perto da base
  let g = noise(vec3f(uv * 1.3, 9.0)) + 0.5 * noise(vec3f(uv * 4.0, 2.0));
  let algae = smoothstep(0.12, 0.3, g) * (1.0 - smoothstep(0.6, 3.0, in.worldPos.y));
  base = mix(base, ALGAE, algae * 0.85);

  // franja vinho: faixa no topo (borda irregular), topo da parede e pontas
  let jag = 0.10 * noise(vec3f(uv * 3.0, 4.0));
  let topBand = smoothstep(WALL_H - 0.50, WALL_H - 0.44, in.worldPos.y + jag);
  let ends = smoothstep(WALL_HALF_W - 0.40, WALL_HALF_W - 0.34, abs(in.worldPos.x) + jag);
  let wine = max(max(topBand, ends), step(0.5, N0.y));
  base = mix(base, WINE, wine * (1.0 - mortar * 0.6));

  // queimado em volta dos buracos
  let soot = noise(vec3f(p * 6.0, 3.0));
  let burn = (1.0 - smoothstep(0.0, BURN_WIDTH * (0.8 + 0.6 * soot), edgeDist)) * 0.92;
  base = mix(base, BURN_COLOR, burn);
  return vec4f(shadeN(in, base, Nb), 1.0);
}
`;
