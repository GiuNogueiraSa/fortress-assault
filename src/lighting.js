// ---------- Iluminação por pixel (todos os objetos opacos) ----------
// Luz do sol (Lambert + especular Blinn-Phong), luz de preenchimento,
// ambiente "hemisférico" (céu em cima, chão embaixo), variação de cor por
// ruído, escurecimento das bordas e névoa leve na distância (cor do horizonte).
// Padrões procedurais por material: estampa de onça com desgaste (tanque),
// manchas (destroços) e, na fortaleza, blocos com relevo falso, hera verde,
// flores vermelhas/rosas e os buracos recortados. Dentro do pátio da
// fortaleza a luz fica amarela/quente.
import { mat4 } from "./math.js";
import { NOISE_WGSL } from "./explosion.js";
import { MAX_HOLES, FORT_HEIGHT, COURTYARD } from "./trench.js";

// ---------- Sol ----------
// Azimute medido a partir de -Z (para onde o tanque olha no início), girando
// para +X. O sol fica ATRÁS da câmera inicial (azimute 150°), para iluminar
// de frente a fachada da fortaleza (que olha para +Z); aparece no céu quando o
// tanque se vira. O disco é desenhado baixo (a câmera olha ~20° para baixo e
// só enxerga até ~1.5° acima do horizonte); a luz usa o MESMO azimute, mais alta.
const SUN_AZIMUTH = 150 * Math.PI / 180;
const sunDir = elevation => [
  Math.sin(SUN_AZIMUTH) * Math.cos(elevation),
  Math.sin(elevation),
  -Math.cos(SUN_AZIMUTH) * Math.cos(elevation),
];
export const SUN_LIGHT_DIR = sunDir(35 * Math.PI / 180);   // usada na iluminação
export const SUN_DISC_DIR = sunDir(0.5 * Math.PI / 180);   // usada para desenhar o sol (sky.js)
export const HORIZON_COLOR = [1.0, 0.74, 0.46];            // céu no horizonte = cor da névoa
const wgslVec3 = v => `vec3f(${v.map(x => x.toFixed(5)).join(", ")})`;

// Materiais: brilho especular, expoente do brilho, quanto ruído de cor e em
// que escala, emissivo (sem luz), padrão procedural (0 nenhum, 1 onça, 2
// manchas) e rim = quanto as bordas de perfil escurecem (menor = mais volume).
export const MATERIALS = {
  tankPaint: { spec: 0.55, shininess: 40, noise: 0.06, noiseScale: 3.0, emissive: 0, pattern: 1, rim: 0.65 },
  metal:     { spec: 1.00, shininess: 80, noise: 0.08, noiseScale: 3.0, emissive: 0, pattern: 0, rim: 0.35 }, // cano: metal pesado
  ground:    { spec: 0.14, shininess: 18, noise: 0.16, noiseScale: 0.6, emissive: 0, pattern: 0, rim: 0.72 }, // brilho do sol no chão
  concrete:  { spec: 0.14, shininess: 22, noise: 0.00, noiseScale: 1.4, emissive: 0, pattern: 0, rim: 0.72 },
  rock:      { spec: 0.10, shininess: 14, noise: 0.12, noiseScale: 6.0, emissive: 0, pattern: 0, rim: 0.72 },
  flash:     { spec: 0,    shininess: 1,  noise: 0,    noiseScale: 1,   emissive: 1, pattern: 0, rim: 1.00 },
};

// Layout do uniform buffer por objeto (192 bytes):
//   mvp mat4 (0) | model mat4 (64) | material vec4 (128) | camPos+noiseScale vec4 (144)
//   | extra vec4 (160): x = padrão, yzw = tinta (multiplica a cor base)
//   | look vec4 (176): x = rim (escurecimento mínimo das bordas)
export const OBJECT_UNIFORM_BYTES = 192;
export function objectUniformData(viewProj, model, material, camPos, tint = [1, 1, 1], pattern = material.pattern) {
  const d = new Float32Array(OBJECT_UNIFORM_BYTES / 4);
  d.set(mat4.multiply(viewProj, model), 0);
  d.set(model, 16);
  d.set([material.spec, material.shininess, material.noise, material.emissive], 32);
  d.set([camPos[0], camPos[1], camPos[2], material.noiseScale], 36);
  d.set([pattern, tint[0], tint[1], tint[2]], 40);
  d.set([material.rim, 0, 0, 0], 44);
  return d;
}

export const litShaderCode = /* wgsl */ `
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  material: vec4f,   // x: especular, y: brilho (expoente), z: ruído, w: emissivo
  camPos: vec4f,     // xyz: posição da câmera, w: escala do ruído
  extra: vec4f,      // x: padrão (0 nenhum, 1 onça, 2 manchas), yzw: tinta
  look: vec4f,       // x: rim (escurecimento mínimo das bordas)
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
const LIGHT_COLOR = vec3f(1.0, 0.93, 0.78);      // sol quente (amarelo/branco)
const FILL_DIR = vec3f(0.45, 0.6, -0.65);        // preenchimento do lado oposto ao sol
const FILL_COLOR = vec3f(0.55, 0.72, 1.0);       // azul claro: luz do céu
const FILL_STRENGTH = 0.40;
const SKY_AMBIENT = vec3f(0.36, 0.44, 0.58);     // ambiente vindo de cima (céu)
const GROUND_AMBIENT = vec3f(0.16, 0.20, 0.16);  // ambiente vindo de baixo (chão verde)
const FOG_COLOR = ${wgslVec3(HORIZON_COLOR)};
const FOG_START = 26.0;                          // longe o bastante para não tingir a fortaleza
const FOG_END = 70.0;
// Pátio interno da fortaleza: luz amarela forte (sol "batendo lá dentro")
const YARD_MIN = vec2f(${COURTYARD.xMin.toFixed(2)}, ${COURTYARD.zMin.toFixed(2)});
const YARD_MAX = vec2f(${COURTYARD.xMax.toFixed(2)}, ${COURTYARD.zMax.toFixed(2)});
const YARD_AMBIENT = vec3f(1.0, 0.88, 0.58);   // amarelo quente, mas sem apagar o azul das paredes
const YARD_LIGHT = vec3f(1.0, 0.90, 0.62);

// 1 dentro do pátio, 0 fora. A borda fica no MEIO da espessura das paredes
// (0.4 além da face interna): a face de dentro recebe a luz quente inteira e a
// face de fora, nenhuma.
fn yardWarmth(p: vec3f) -> f32 {
  let lo = YARD_MIN - vec2f(0.4);
  let hi = YARD_MAX + vec2f(0.4);
  let inX = smoothstep(lo.x - 0.15, lo.x + 0.15, p.x) * (1.0 - smoothstep(hi.x - 0.15, hi.x + 0.15, p.x));
  let inZ = smoothstep(lo.y - 0.15, lo.y + 0.15, p.z) * (1.0 - smoothstep(hi.y - 0.15, hi.y + 0.15, p.z));
  return inX * inZ;
}

// Iluminação comum a todos os opacos, com normal, especular e rim dados por pixel
fn shadeFull(in: VertexOut, baseColor: vec3f, normalIn: vec3f, specK: f32, shin: f32, rim: f32) -> vec3f {
  let V = normalize(u.camPos.xyz - in.worldPos);
  var N = normalize(normalIn);
  // cullMode "none" + modelo doubleSided: a normal deve apontar para a câmera
  if (dot(N, V) < 0.0) {
    N = -N;
  }
  let L = normalize(LIGHT_DIR);
  let F = normalize(FILL_DIR);

  // Variação sutil de cor: duas oitavas do gradient noise do shader de explosão
  var albedo = baseColor;
  if (u.material.z > 0.0) {   // a fortaleza tem variação própria (mais barata): pula aqui
    let q = in.localPos * u.camPos.w;
    let n = 0.65 * noise(q) + 0.35 * noise(q * 4.0);
    albedo = baseColor * (1.0 + u.material.z * n * 2.0);
  }

  let diffuse = max(dot(N, L), 0.0);
  let fill = max(dot(N, F), 0.0);
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), shin) * specK * step(0.0, dot(N, L));
  // no pátio: ambiente amarelo forte e sol mais quente/intenso (só a luz muda)
  let warm = yardWarmth(in.worldPos);
  let ambient = mix(mix(GROUND_AMBIENT, SKY_AMBIENT, 0.5 + 0.5 * N.y), YARD_AMBIENT * 0.75, warm);
  let sunCol = mix(LIGHT_COLOR, YARD_LIGHT * 1.3, warm);

  // "Oclusão" barata: superfícies quase de perfil para a câmera (bordas) escurecem
  let edge = mix(rim, 1.0, sqrt(max(dot(N, V), 0.0)));

  let lit = albedo * (ambient + 0.85 * diffuse * sunCol + FILL_STRENGTH * fill * FILL_COLOR) + spec * sunCol;
  // névoa leve na distância, na cor do horizonte: integra o chão com o céu
  let fog = smoothstep(FOG_START, FOG_END, distance(u.camPos.xyz, in.worldPos)) * 0.65;
  return mix(lit * edge, FOG_COLOR, fog);
}
fn shadeN(in: VertexOut, baseColor: vec3f, normalIn: vec3f) -> vec3f {
  return shadeFull(in, baseColor, normalIn, u.material.x, u.material.y, u.look.x);
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
  // bordas mais duras e anel mais largo: a mancha se destaca como pintura
  let ring = smoothstep(0.31, 0.285, d) * smoothstep(0.07, 0.095, d);
  let core = smoothstep(0.10, 0.075, d);
  let c = mix(base, base * vec3f(0.80, 0.55, 0.28), core * 0.9);
  return mix(c, JAGUAR_SPOT, ring);
}
// Desgaste da pintura: manchas leves mais escuras/claras do MESMO amarelo
// (sujeira e tinta gasta), mais fortes perto do chão
fn wear(base: vec3f, p: vec3f) -> vec3f {
  let w = noise(p * 5.0) + 0.5 * noise(p * 17.0);
  let dirt = smoothstep(0.15, 0.55, w) * (0.10 + 0.20 * (1.0 - smoothstep(0.0, 0.8, p.y)));
  let scuff = smoothstep(0.35, 0.6, noise(p * 9.0 + 3.0)) * 0.12;
  return base * (1.0 - dirt) * (1.0 + scuff);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  if (u.material.w > 0.5) {
    return vec4f(in.color, 1.0);   // emissivo (flash do tiro): sem iluminação
  }
  var base = in.color * u.extra.yzw;
  // tanque: onça + desgaste nas partes amarelas; nas escuras (rodas, esteiras),
  // metal com sulcos de contraste e brilho especular forte
  if (u.extra.x > 0.5 && u.extra.x < 1.5) {
    if (in.color.r > 0.5) {
      base = wear(jaguar(base, in.localPos), in.localPos);
    } else {
      let lp = in.localPos;
      // estrias das esteiras/rodas: faixas escuras ao longo do comprimento
      let g = fract(lp.z * 13.0);
      let groove = smoothstep(0.0, 0.12, g) * smoothstep(0.62, 0.5, g);
      let cavity = select(1.0, mix(0.35, 1.0, groove), abs(lp.x) > 0.36);
      return vec4f(shadeFull(in, base * cavity, in.normal, 0.9 * cavity, 64.0, 0.35), 1.0);
    }
  }
  // manchas: material heterogêneo (destroços)
  if (u.extra.x > 1.5) {
    let m = smoothstep(0.05, 0.3, noise(in.localPos * 9.0 + u.extra.yzw * 7.0));
    base = base * (1.0 - 0.55 * m);
  }
  return vec4f(shade(in, base), 1.0);
}

// ---------- Fortaleza ----------
// Buracos: cada impacto = (x, y, raio, semente) + fatia de profundidade
// (zMin, zMax) da caixa onde nasceu. O raio de corte de cada pixel é
// perturbado por ruído (borda rasgada); dentro do corte o pixel é descartado
// (vazado) e numa faixa logo fora dele a cor escurece (queimado, preto).
// Superfície: blocos em fiada (juntas e chanfro só na NORMAL), hera verde
// subindo pela parede (mais densa embaixo) e flores vermelhas/rosas nela,
// com raras flores amarelas. Paleta só: azul, verde, vermelho/rosa, amarelo.
struct Holes {
  count: vec4f,                              // x: quantos impactos valem
  items: array<vec4f, ${2 * MAX_HOLES}>,     // [2i]: xy centro, z raio, w semente; [2i+1]: zMin, zMax
};
@group(1) @binding(0) var<uniform> holes: Holes;

const BURN_COLOR = vec3f(0.01, 0.012, 0.02);     // queimado: preto
const BURN_WIDTH = 0.28;
const WALL_H = ${FORT_HEIGHT.toFixed(3)};
const BLOCK = vec2f(0.9, 0.45);                  // tamanho de um bloco
const MORTAR_COLOR = vec3f(0.06, 0.10, 0.22);    // junta: azul mais escuro
const IVY = vec3f(0.05, 0.25, 0.08);
const IVY_LIGHT = vec3f(0.08, 0.36, 0.11);
const RED = vec3f(0.60, 0.10, 0.15);
const PINK = vec3f(0.75, 0.20, 0.35);
const YELLOW = vec3f(0.90, 0.85, 0.10);

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
// Value noise 2D barato (4 hashes por chamada, contra 8 n_rand3 do gradient
// noise 3D): usado nos padrões da superfície da fortaleza, que cobre boa parte
// da tela. Saída em -0.5..0.5, como o noise() original.
fn vnoise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) - 0.5;
}

@fragment
fn fs_trench(in: VertexOut) -> @location(0) vec4f {
  let p = in.worldPos.xy;
  var edgeDist = 1e9;   // distância até a borda do corte mais próximo (negativa = dentro)
  let n = i32(holes.count.x);
  for (var i = 0; i < n; i++) {
    let h = holes.items[2 * i];
    let slab = holes.items[2 * i + 1];
    if (in.worldPos.z < slab.x - 0.02 || in.worldPos.z > slab.y + 0.02) {
      continue;          // outro bloco de profundidade (ex.: parede do fundo)
    }
    let d = distance(p, h.xy);
    if (d > h.z * 1.7 + BURN_WIDTH) {
      continue;          // longe: pula o ruído
    }
    let q = vec3f(p * 2.2, h.w);
    let wobble = 0.55 * noise(q) + 0.30 * noise(q * 3.7 + 11.0);
    edgeDist = min(edgeDist, d - h.z * (1.0 + wobble));
  }
  if (edgeDist < 0.0) {
    discard;             // dentro do buraco: a parede some aqui (vazado)
  }

  // detalhes amarelos do portão (dobradiças/trinco): cor própria, sem padrões
  if (in.color.r > 0.5) {
    return vec4f(shadeFull(in, in.color, in.normal, 0.8, 60.0, 0.5), 1.0);
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
  let ex = min(f.x, 1.0 - f.x) * BLOCK.x;
  let ey = min(f.y, 1.0 - f.y) * BLOCK.y;
  let mortar = 1.0 - smoothstep(0.012, 0.035, min(ex, ey));
  let bevel = 0.07;
  let tx = select(1.0, -1.0, f.x < 0.5) * (1.0 - smoothstep(0.0, bevel, ex));
  let ty = select(1.0, -1.0, f.y < 0.5) * (1.0 - smoothstep(0.0, bevel, ey));
  let rough = vec2f(vnoise2(uv * 7.0), vnoise2(uv * 7.0 + 19.3));
  var Nb = normalize(N0 + 0.55 * (tx * T + ty * B) + 0.22 * (rough.x * T + rough.y * B));

  var base = in.color * (0.88 + 0.22 * hash2(id));   // azul, tom variando por bloco
  base = mix(base, MORTAR_COLOR, mortar);

  // Hera: manchas orgânicas esticadas na vertical ("subindo"), mais densas
  // embaixo; o limiar sobe com a altura -> ~40-60% do azul continua visível
  let h01 = clamp(in.worldPos.y / WALL_H, 0.0, 1.0);
  let ivyN = vnoise2(vec2f(uv.x * 0.9, uv.y * 0.35) + 3.1) + 0.45 * vnoise2(uv * 2.6 + 7.7)
           + 0.25 * vnoise2(uv * 9.0 + 1.3);   // folhas: borda recortada
  let ivy = smoothstep(-0.02, 0.06, ivyN - mix(-0.19, 0.22, h01));
  if (ivy > 0.01) {
    // folhagem: dois verdes e relevo mais forte (folhas)
    let leaf = vnoise2(uv * 14.0 + 5.0);
    let ivyCol = mix(IVY, IVY_LIGHT, smoothstep(-0.2, 0.4, leaf));
    let leafN = vec2f(vnoise2(uv * 12.0 + 2.0), vnoise2(uv * 12.0 + 9.0));
    Nb = normalize(mix(Nb, normalize(N0 + 0.6 * (leafN.x * T + leafN.y * B)), ivy));
    base = mix(base, ivyCol, ivy);
    // flores: pontos pequenos numa grade com jitter, só sobre a hera
    let cell = floor(uv * 4.0);
    let fr = fract(uv * 4.0);
    let rnd = vec2f(hash2(cell), hash2(cell + 17.0));
    let dF = distance(fr, 0.25 + 0.5 * rnd);
    let pick = hash2(cell + 31.0);
    let flower = (1.0 - smoothstep(0.12, 0.17, dF)) * step(0.12, pick) * ivy;
    let petal = select(RED, PINK, pick > 0.68);
    let flowerCol = select(petal, YELLOW, pick > 0.975);   // amarelo: raro
    base = mix(base, flowerCol, flower);
  }

  // queimado em volta dos buracos (só calcula perto deles)
  if (edgeDist < BURN_WIDTH * 1.5) {
    let soot = vnoise2(p * 6.0 + 3.0);
    let burn = (1.0 - smoothstep(0.0, BURN_WIDTH * (0.8 + 0.6 * soot), edgeDist)) * 0.92;
    base = mix(base, BURN_COLOR, burn);
  }
  return vec4f(shadeN(in, base, Nb), 1.0);
}
`;
