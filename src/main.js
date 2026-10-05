// ---------- Ponto de entrada: WebGPU, entrada do usuário e loop do jogo ----------
import { mat4 } from "./math.js";
import { buildGround, buildProjectile, buildRock, FLOATS_PER_VERTEX } from "./geometry.js";
import {
  createTrench, resetTrench, trenchHitTest, addHole, trenchDestroyed, trenchFull,
  holesUniformData, buildTrenchMesh, rubbleForHole, HOLES_UNIFORM_BYTES, TRENCH_REBUILD_DESTROYED, randomDebrisTint,
  tankBlocked, DOOR_HP,
} from "./trench.js";
import {
  buildBoxTank, buildModelTank, buildMuzzleFlash, setTankRig, barrelLength, tankModelMatrices,
} from "./tank.js";
import { loadGLB } from "./gltf.js";
import { bodyForward, moveTank, spawnProjectile, updateProjectiles, predictTrajectory, stepProjectile } from "./physics.js";
import { buildTrees } from "./scenery.js";
import { createAimLine } from "./aimLine.js";
import {
  litShaderCode, shadowShaderCode, objectUniformData, OBJECT_UNIFORM_BYTES, MATERIALS,
  sceneUniformData, SCENE_UNIFORM_BYTES, sunViewProj, SHADOW_MAP_SIZE,
} from "./lighting.js";
import { createSky } from "./sky.js";
import {
  explosionShaderCode, explosionUniformData, EXPLOSION_UNIFORM_BYTES, EXPLOSION_DURATION, SHOCKWAVE_DURATION,
  SHOCKWAVE_QUAD_SIZE,
} from "./explosion.js";

// Plano B: false volta para o tanque antigo em caixas (se o modelo der problema).
// Se o carregamento do modelo falhar, o jogo também cai nas caixas sozinho.
const USE_MODEL_3D = true;
// Anti-aliasing: amostras por pixel (MSAA). 1 desliga; 4 é o valor suportado
// por qualquer dispositivo WebGPU.
const SAMPLE_COUNT = 4;
// Teto do devicePixelRatio: telas densas custam muitos pixels a mais sem ganho
// visível aqui. Com sombras + castelo, em DPR 2 o jogo mediu 43-47 fps; com
// teto 1.5, ~57-60 fps (telas 2x renderizam a 1.5x).
const MAX_PIXEL_RATIO = 1.5;
const MODEL_URL = "assets/models/tank.glb";

const statusEl = document.getElementById("status");
const fallbackEl = document.getElementById("fallback");
const canvas = document.getElementById("canvas");
const crosshairEl = document.getElementById("crosshair");
const lockHintEl = document.getElementById("lock-hint");

canvas.addEventListener("click", () => {
  canvas.focus();
  canvas.requestPointerLock();
});
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  crosshairEl.style.display = locked ? "block" : "none";
  lockHintEl.textContent = locked
    ? "Mira ativa — Esc para liberar o mouse"
    : "Clique no canvas para travar o mouse e ajustar a elevação do cano";
});

function setStatus(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.className = ok ? "status-ok" : "status-bad";
}

async function main() {
  if (!navigator.gpu) {
    setStatus("WebGPU indisponível", false);
    fallbackEl.style.display = "block";
    canvas.style.display = "none";
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { setStatus("Falha ao obter adaptador GPU", false); return; }
  const device = await adapter.requestDevice();
  // Erros de validação do WebGPU não lançam exceção: só aparecem no console.
  // Mostrá-los no HUD permite diagnosticar navegadores sem console à mão
  // (ex.: o navegador embutido do VS Code).
  let gpuErrorShown = false;
  device.addEventListener("uncapturederror", (e) => {
    console.error(e.error);
    if (!gpuErrorShown) setStatus("Erro de GPU: " + e.error.message.slice(0, 300), false);
    gpuErrorShown = true;
  });
  device.lost.then((info) => setStatus("GPU perdida: " + info.message, false));

  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  // ---------- Pipelines de cena (iluminação por pixel + sombras, src/lighting.js) ----------
  const shaderModule = device.createShaderModule({ code: litShaderCode });
  // grupo 0: uniform de cada objeto
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }],
  });
  // grupo 1: cena (matriz do sol, clarão da explosão) + mapa de sombras
  const sceneLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
    ],
  });
  // grupo 2: lista de buracos (só a fortaleza usa)
  const holesLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }],
  });
  const litVertexState = {
    module: shaderModule,
    entryPoint: "vs_main",
    buffers: [{
      arrayStride: FLOATS_PER_VERTEX * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },      // posição
        { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },  // normal
        { shaderLocation: 2, offset: 6 * 4, format: "float32x3" },  // cor base
      ],
    }],
  };
  const litPipeline = (entryPoint, layouts, multisampleExtra = {}) => device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
    vertex: litVertexState,
    fragment: { module: shaderModule, entryPoint, targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    multisample: { count: SAMPLE_COUNT, ...multisampleExtra },
  });
  const pipeline = litPipeline("fs_main", [bindGroupLayout, sceneLayout]);
  const trenchPipeline = litPipeline("fs_trench", [bindGroupLayout, sceneLayout, holesLayout]);
  // destroços somem aos poucos: o alpha vira "cobertura" das 4 amostras do MSAA
  // (alpha-to-coverage), sem precisar ordenar objetos transparentes
  const debrisPipeline = litPipeline("fs_main", [bindGroupLayout, sceneLayout],
    { alphaToCoverageEnabled: SAMPLE_COUNT > 1 });

  // ---------- Sombras: profundidade da cena vista do sol (shadow map) ----------
  const shadowModule = device.createShaderModule({ code: shadowShaderCode });
  const lightLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
  });
  const shadowVertex = { module: shadowModule, entryPoint: "vs_shadow", buffers: litVertexState.buffers };
  // depthBias: empurra a profundidade gravada um pouco para longe (evita "acne")
  const shadowDepth = { format: "depth32float", depthWriteEnabled: true, depthCompare: "less", depthBias: 2, depthBiasSlopeScale: 2.0 };
  const shadowPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout, lightLayout] }),
    vertex: shadowVertex,
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: shadowDepth,
  });
  const shadowTrenchPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout, lightLayout, holesLayout] }),
    vertex: shadowVertex,
    fragment: { module: shadowModule, entryPoint: "fs_shadow_trench", targets: [] },  // buracos deixam a luz passar
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: shadowDepth,
  });
  const shadowMap = device.createTexture({
    size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE], format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const shadowMapView = shadowMap.createView();
  const lightVP = sunViewProj();   // o sol não se move: calculada uma vez
  const lightBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(lightBuffer, 0, lightVP);
  const lightBindGroup = device.createBindGroup({ layout: lightLayout, entries: [{ binding: 0, resource: { buffer: lightBuffer } }] });
  const sceneBuffer = device.createBuffer({ size: SCENE_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const sceneBindGroup = device.createBindGroup({
    layout: sceneLayout,
    entries: [
      { binding: 0, resource: { buffer: sceneBuffer } },
      { binding: 1, resource: shadowMapView },
      { binding: 2, resource: device.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" }) },
    ],
  });

  // Malha na GPU (pode ser compartilhada por vários objetos)
  function makeMesh(vertexData) {
    const buffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, vertexData);
    return { buffer, count: vertexData.length / FLOATS_PER_VERTEX };
  }
  // Objeto desenhável: uniform buffer próprio + material + malha (trocável).
  function makeDrawable(vertexData, material) {
    const uniformBuffer = device.createBuffer({
      size: OBJECT_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    const mesh = vertexData ? makeMesh(vertexData) : { buffer: null, count: 0 };
    return { vertexBuffer: mesh.buffer, count: mesh.count, uniformBuffer, bindGroup, material };
  }
  const useMesh = (d, mesh) => { d.vertexBuffer = mesh.buffer; d.count = mesh.count; };
  function drawObject(pass, d) {
    pass.setBindGroup(0, d.bindGroup);
    pass.setVertexBuffer(0, d.vertexBuffer);
    pass.draw(d.count);
  }

  // ---------- Tanque: modelo 3D (ou caixas, plano B) ----------
  let tankGeo = null;
  if (USE_MODEL_3D) {
    try {
      tankGeo = buildModelTank(await loadGLB(MODEL_URL));
    } catch (err) {
      console.warn("Modelo 3D falhou, usando o tanque em caixas:", err);
    }
  }
  const usingModel = tankGeo !== null;
  if (!usingModel) tankGeo = buildBoxTank();
  setTankRig(tankGeo.rig);
  const chassis = makeDrawable(tankGeo.chassis, MATERIALS.tankPaint);   // amarelo com onça
  const turret = tankGeo.turret ? makeDrawable(tankGeo.turret, MATERIALS.tankPaint) : null;
  const barrel = makeDrawable(tankGeo.barrel, MATERIALS.metal);

  const ground = makeDrawable(buildGround(), MATERIALS.ground);
  const trees = makeDrawable(buildTrees(), MATERIALS.foliage);   // fundo, atrás da fortaleza
  const muzzleFlash = makeDrawable(buildMuzzleFlash(), MATERIALS.flash);

  // Trincheira: segmentos simples (malha fixa) + lista de buracos num uniform
  // lido pelo fs_trench (src/trench.js e src/lighting.js).
  const trench = createTrench();
  const isTrenchSolid = pos => trenchHitTest(trench, pos) !== null;
  const fortMesh = buildTrenchMesh(trench);
  const trenchDrawable = makeDrawable(fortMesh.walls, MATERIALS.stone);
  const doorDrawable = makeDrawable(fortMesh.door, MATERIALS.stone);   // some quando o portão cai
  const isTankBlocked = (x, z) => tankBlocked(trench, x, z);
  const holesBuffer = device.createBuffer({
    size: HOLES_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const holesBindGroup = device.createBindGroup({
    layout: holesLayout,
    entries: [{ binding: 0, resource: { buffer: holesBuffer } }],
  });
  const uploadHoles = () => device.queue.writeBuffer(holesBuffer, 0, holesUniformData(trench));
  uploadHoles();
  let trenchDamage = 0; // fração da face destruída (recalculada a cada buraco)

  const MAX_PROJECTILES = 8;
  const projectileVerts = buildProjectile();
  const projectilePool = Array.from({ length: MAX_PROJECTILES }, () => makeDrawable(projectileVerts, MATERIALS.metal));

  // Escombros com forma de pedra quebrada: ROCK_SHAPES poliedros irregulares
  // gerados na largada (buildRock); cada pedaço sorteia uma forma, um tamanho e
  // uma rotação, então nenhum fica igual ao outro.
  // cor base cinza: a cor de cada pedaço vem da tinta sorteada (randomDebrisTint)
  const ROCK_SHAPES = 16;
  const ROCK_GREY = [0.5, 0.5, 0.5];
  const rockMeshes = Array.from({ length: ROCK_SHAPES }, () => makeMesh(buildRock(ROCK_GREY)));
  const chipMeshes = Array.from({ length: ROCK_SHAPES }, () => makeMesh(buildRock(ROCK_GREY, Math.random, true)));
  const randomRock = () => rockMeshes[Math.floor(Math.random() * ROCK_SHAPES)];
  const randomChip = () => chipMeshes[Math.floor(Math.random() * ROCK_SHAPES)];
  const randomPattern = () => (Math.random() < 0.4 ? 2 : 0);   // 40% com manchas
  const scaleMatrix = s => new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);

  // Destroços da explosão: 40-60 lascas de 0.05 a 0.25 (mais pequenas que
  // grandes), mesma gravidade dos projéteis, giram, quicam uma vez e somem
  // aos poucos. Pool fixo.
  const MAX_DEBRIS = 240;
  const DEBRIS_PER_HIT_MIN = 40, DEBRIS_PER_HIT_MAX = 60;
  const DEBRIS_SIZE_MIN = 0.05, DEBRIS_SIZE_MAX = 0.25;
  const DEBRIS_FADE = 0.7;   // segundos finais em que a lasca vai sumindo
  const debrisPool = Array.from({ length: MAX_DEBRIS }, () => makeDrawable(null, MATERIALS.rock));

  // Entulho estático no chão (fica até a trincheira ser reconstruída)
  const MAX_RUBBLE = 80;
  const rubblePool = Array.from({ length: MAX_RUBBLE }, () => makeDrawable(null, MATERIALS.rock));
  const rubble = []; // {slot, model, tint, pattern}
  let nextRubbleSlot = 0;
  function spawnRubble(pieces) {
    for (const r of pieces) {
      if (rubble.length >= MAX_RUBBLE) rubble.shift();
      useMesh(rubblePool[nextRubbleSlot], randomRock());
      // meio enterrado e levemente inclinado, como pedra que caiu e parou
      const model = mat4.multiply(mat4.translation(r.pos[0], r.size * 0.15, r.pos[2]),
        mat4.multiply(mat4.rotationY(Math.random() * 6.28),
          mat4.multiply(mat4.rotationX((Math.random() - 0.5) * 0.6), scaleMatrix(r.size))));
      rubble.push({ slot: nextRubbleSlot, model, tint: randomDebrisTint(), pattern: randomPattern() });
      nextRubbleSlot = (nextRubbleSlot + 1) % MAX_RUBBLE;
    }
  }

  // ---------- Explosão (shader externo, ver src/explosion.js) ----------
  // Bola de fogo: quad billboard gerado no vertex shader; pixels fora do efeito
  // são descartados. Onda de choque: mesmo quad (maior), anel semitransparente.
  const explosionModule = device.createShaderModule({ code: explosionShaderCode });
  const explosionPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: explosionModule, entryPoint: "vs_main" },
    fragment: { module: explosionModule, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    multisample: { count: SAMPLE_COUNT },
  });
  const shockwavePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: explosionModule, entryPoint: "vs_main" },
    fragment: {
      module: explosionModule,
      entryPoint: "fs_shockwave",
      targets: [{
        format,
        // mistura pela transparência mantendo o alpha do canvas em 1 (como a linha de mira)
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { srcFactor: "zero", dstFactor: "one" },
        },
      }],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "less" },
    multisample: { count: SAMPLE_COUNT },
  });
  // Várias explosões ao mesmo tempo (tiros seguidos em pontos diferentes):
  // cada "slot" tem seus próprios uniform buffers, como o pool de projéteis.
  const MAX_EXPLOSIONS = 4;
  function explosionBuffer(pipelineForLayout) {
    const ubo = device.createBuffer({
      size: EXPLOSION_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipelineForLayout.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ubo } }],
    });
    return { ubo, bindGroup };
  }
  const explosionSlots = Array.from({ length: MAX_EXPLOSIONS }, () => ({
    fire: explosionBuffer(explosionPipeline),
    shock: explosionBuffer(shockwavePipeline),
  }));
  const EXPLOSION_QUAD_SIZE = 3.0; // lado do quad em unidades de mundo
  const FIREBALL_RISE = 0.5;       // a bola de fogo sobe devagar (unidades/s)
  const FLASH_TIME = 0.12;         // clarão de luz no impacto (s)
  const FLASH_INTENSITY = 3.0;
  // O anel é um quad voltado para a câmera; com a câmera no alto, a metade de
  // cima dele "deita" para dentro do muro e o teste de profundidade a esconde.
  // Puxá-lo um pouco na direção da câmera deixa o anel inteiro na frente do muro.
  const SHOCKWAVE_TOWARD_CAMERA = 0.8;
  const SHAKE_DURATION = 0.15;     // tremor de câmera no impacto (s)
  const SHAKE_AMPLITUDE = 0.1;     // ±0.1 no plano da tela, decaindo suave

  const aimLine = createAimLine(device, format, SAMPLE_COUNT);
  const sky = createSky(device, format, SAMPLE_COUNT);
  const AIM_LINE_ACTIVE = [1, 1, 1, 0.55];  // mouse travado (mirando)
  const AIM_LINE_IDLE = [1, 1, 1, 0.15];    // mouse solto: bem discreta

  // ---------- Resolução e alvos de renderização ----------
  // Resolução interna = tamanho exibido (CSS) x devicePixelRatio, para não
  // esticar uma imagem pequena (pixelado). Com MSAA, desenha-se numa textura
  // multisample que é "resolvida" (média das amostras) na textura do canvas;
  // a profundidade precisa do mesmo sampleCount. Tudo é recriado quando o
  // tamanho muda (janela redimensionada, zoom, troca de monitor).
  const FOV_Y = Math.PI / 4;
  let msaaTexture = null, depthTexture = null, projection = null;
  function resizeRenderTargets() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const maxDim = device.limits.maxTextureDimension2D;
    const w = Math.max(1, Math.min(maxDim, Math.round(canvas.clientWidth * dpr)));
    const h = Math.max(1, Math.min(maxDim, Math.round(canvas.clientHeight * dpr)));
    if (depthTexture && w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    msaaTexture?.destroy();
    depthTexture?.destroy();
    msaaTexture = SAMPLE_COUNT > 1 ? device.createTexture({
      size: [w, h], format, sampleCount: SAMPLE_COUNT, usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }) : null;
    depthTexture = device.createTexture({
      size: [w, h], format: "depth24plus", sampleCount: SAMPLE_COUNT, usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    projection = mat4.perspective(FOV_Y, w / h, 0.1, 200);
  }
  resizeRenderTargets();
  window.addEventListener("resize", resizeRenderTargets);

  // ---------- Estado ----------
  const state = {
    x: 0, z: 1.5,
    yaw: 0,                    // direção do corpo (A/D) — torre, cano e câmera seguem junto
    aimPitch: Math.PI / 3,     // elevação do cano (60° inicial, ajustável pelo mouse)
  };
  // acesso de leitura para testes automatizados e depuração no console
  window.__game = { state, trench };
  const MOUSE_PITCH_SENS = 0.0022;
  // o cano pode apontar um pouco para baixo (~ -9°): de perto, sem isso o tiro
  // sai na altura da boca (~1.5) e não dá para abrir brecha rente ao chão
  const PITCH_MIN = -0.15;
  const PITCH_MAX = 1.35; // ~77 graus
  const CAM_DISTANCE = 6.5;
  const CAM_HEIGHT = 3.2;

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    state.aimPitch += e.movementY * MOUSE_PITCH_SENS;
    state.aimPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, state.aimPitch));
  });

  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if ([" ", "ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    if (e.key === " ") fire();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  let flashTimer = 0;
  let lastShotAt = -999;
  const projectiles = []; // {pos:[x,y,z], vel:[vx,vy,vz], slot:index}
  let nextSlot = 0;
  const explosions = []; // {pos:[x,y,z], age: segundos desde o impacto, slot:index}
  let nextExplosionSlot = 0;
  const debris = [];     // {pos, vel, slot, rot, spin, size, tint, pattern, age, life}
  let nextDebrisSlot = 0;
  let shakeTime = 0;
  let shakePhase = 0;
  const flash = { pos: [0, 0, 0], t: 0 };
  let elapsed = 0;

  function spawnExplosion(pos) {
    if (explosions.length >= MAX_EXPLOSIONS) explosions.shift();
    explosions.push({ pos: [...pos], age: 0, slot: nextExplosionSlot });
    nextExplosionSlot = (nextExplosionSlot + 1) % MAX_EXPLOSIONS;
  }

  // Lascas saindo do impacto em direções aleatórias, com viés para trás do tiro
  // (para fora do muro, do lado de quem atirou).
  function spawnDebris(pos, shotVel) {
    const back = Math.hypot(shotVel[0], shotVel[2]) || 1;
    const bx = -shotVel[0] / back, bz = -shotVel[2] / back;
    const count = DEBRIS_PER_HIT_MIN + Math.floor(Math.random() * (DEBRIS_PER_HIT_MAX - DEBRIS_PER_HIT_MIN + 1));
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const out = 3.0 + Math.random() * 4.0;   // mais horizontal que vertical
      if (debris.length >= MAX_DEBRIS) debris.shift();
      const r = Math.random();
      debris.push({
        pos: [pos[0] + bx * 0.35, pos[1], pos[2] + bz * 0.35],
        vel: [Math.cos(a) * out + bx * 2.0, 1.0 + Math.random() * 2.5, Math.sin(a) * out + bz * 2.0],
        slot: nextDebrisSlot,
        size: DEBRIS_SIZE_MIN + (DEBRIS_SIZE_MAX - DEBRIS_SIZE_MIN) * r * r,
        age: 0,
        life: 1.4 + Math.random() * 1.0,
        tint: randomDebrisTint(),
        pattern: randomPattern(),
        rot: [Math.random() * 6.28, Math.random() * 6.28],
        spin: [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20],
      });
      useMesh(debrisPool[nextDebrisSlot], randomChip());
      nextDebrisSlot = (nextDebrisSlot + 1) % MAX_DEBRIS;
    }
  }

  function fire() {
    const now = performance.now();
    if (now - lastShotAt < 250) return; // limite simples de taxa de tiro
    lastShotAt = now;
    flashTimer = 0.08;

    if (projectiles.length >= MAX_PROJECTILES) projectiles.shift();
    projectiles.push({ ...spawnProjectile(state), slot: nextSlot });
    nextSlot = (nextSlot + 1) % MAX_PROJECTILES;

    setStatus("Tiro disparado — trajetória em parábola por gravidade real", true);
  }

  const projectileEvents = {
    onHitTarget(p) {
      // buraco irregular onde o tiro atravessa, borda queimada, entulho no chão
      const b = trenchHitTest(trench, p.pos);   // parte atingida (muralha, torre, ameia, portão…)
      const { hole, doorFell } = addHole(trench, p.pos, p.vel, b);
      uploadHoles();
      trenchDamage = trenchDestroyed(trench);
      if (hole && !b.door) spawnRubble(rubbleForHole(hole));
      spawnExplosion(p.pos);
      spawnDebris(p.pos, p.vel);
      shakeTime = SHAKE_DURATION;
      shakePhase = Math.random() * 100;
      flash.pos = [p.pos[0] - p.vel[0] * 0.05, p.pos[1] + 0.3, p.pos[2] - p.vel[2] * 0.05];   // um pouco fora da parede
      flash.t = FLASH_TIME;
      if (doorFell) {
        // o portão inteiro desaba: mais destroços e entulho no vão
        spawnDebris([0, 1.5, trench.door.max[2]], p.vel);
        spawnRubble(rubbleForHole({ c: [0, 0, (trench.door.min[2] + trench.door.max[2]) / 2], d: [0, 0, -1], r: 1.4 }));
        setStatus("Portão derrubado! Entre no pátio da fortaleza", true);
      } else if (b.door) {
        setStatus(`Portão atingido: ${trench.doorHits}/${DOOR_HP}`, true);
      } else if (!hole) {
        setStatus("O castelo não aguenta mais buracos — afaste-se para ele ser reconstruído", true);
      } else {
        setStatus(`Impacto no castelo! Fachada ${Math.round(trenchDamage * 100)}% destruída`, true);
      }
    },
    onHitGround() {
      setStatus("Impacto no chão", true);
    },
  };
  // Destroços: mesmo passo de física dos projéteis (stepProjectile); no chão
  // quicam uma vez, depois param, e somem aos poucos no fim da vida
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.age += dt;
      if (!d.resting) {
        stepProjectile(d, dt);
        d.rot[0] += d.spin[0] * dt;
        d.rot[1] += d.spin[1] * dt;
        const floorY = d.size * 0.25;
        if (d.pos[1] <= floorY) {
          d.pos[1] = floorY;
          if (!d.bounced && d.vel[1] < -1.5) {
            d.vel = [d.vel[0] * 0.45, -d.vel[1] * 0.3, d.vel[2] * 0.45];
            d.spin = d.spin.map(v => v * 0.5);
            d.bounced = true;
          } else {
            d.resting = true;
          }
        }
      }
      if (d.age > d.life) debris.splice(i, 1);
    }
  }

  setStatus(usingModel || !USE_MODEL_3D
    ? "WebGPU ativo — clique no canvas para mirar"
    : "Modelo 3D falhou — usando o tanque em caixas (ver console)", usingModel || !USE_MODEL_3D);

  let lastTime = performance.now();
  let frameErrorShown = false;
  // Uma exceção dentro do quadro pararia o loop (tela congelada/preta sem aviso):
  // mostra o erro no HUD e continua tentando nos próximos quadros.
  function frame(now) {
    try {
      renderFrame(now);
    } catch (err) {
      console.error(err);
      if (!frameErrorShown) setStatus("Erro no quadro: " + err.message, false);
      frameErrorShown = true;
    }
    requestAnimationFrame(frame);
  }
  function renderFrame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;
    // também pega mudanças de tamanho que não disparam "resize" (layout, zoom)
    resizeRenderTargets();

    moveTank(state, keys, dt, isTankBlocked);
    const forward = bodyForward(state.yaw);

    if (flashTimer > 0) flashTimer -= dt;

    updateProjectiles(projectiles, dt, isTrenchSolid, projectileEvents);
    updateDebris(dt);
    if (flash.t > 0) flash.t -= dt;

    for (let i = explosions.length - 1; i >= 0; i--) {
      explosions[i].age += dt;
      explosions[i].pos[1] += FIREBALL_RISE * dt;
      if (explosions[i].age > EXPLOSION_DURATION) explosions.splice(i, 1);
    }

    // Castelo muito destruído (fachada ou lista de buracos cheia): reconstrói
    // só com o tanque LONGE dele (na frente, a mais de 8 da muralha, ou já
    // além do fundo), para não prender o tanque nem tampar o caminho aberto
    const tankAway = state.z > -1 || state.z < -26 || Math.abs(state.x) > 18;
    if (explosions.length === 0 && tankAway && (trenchDamage >= TRENCH_REBUILD_DESTROYED || trenchFull(trench))) {
      resetTrench(trench);
      uploadHoles();
      trenchDamage = 0;
      rubble.length = 0;
      setStatus("Nova fortaleza inimiga!", true);
    }

    // Câmera em terceira pessoa, atrás do corpo do tanque, com tremor no impacto
    let shake = [0, 0, 0];
    if (shakeTime > 0) {
      const k = shakeTime / SHAKE_DURATION;
      const amp = SHAKE_AMPLITUDE * k * k;   // decai suave (quadrático)
      const sx = Math.sin(elapsed * 85 + shakePhase) * amp, sy = Math.cos(elapsed * 67 + shakePhase * 1.7) * amp;
      const right = [-forward[2], 0, forward[0]];
      shake = [right[0] * sx, sy, right[2] * sx];
      shakeTime -= dt;
    }
    // se uma parede do castelo fica entre o tanque e a câmera (atravessando uma
    // brecha), a câmera chega mais perto para não ficar dentro da alvenaria
    let camDist = CAM_DISTANCE;
    for (let d = 0.6; d <= CAM_DISTANCE; d += 0.25) {
      const k = d / CAM_DISTANCE;
      const probe = [state.x - forward[0] * d, 0.8 + (CAM_HEIGHT - 0.8) * k, state.z - forward[2] * d];
      if (isTrenchSolid(probe)) { camDist = Math.max(0.6, d - 0.35); break; }
    }
    const camK = camDist / CAM_DISTANCE;
    const eye = [
      state.x - forward[0] * camDist + shake[0],
      0.8 + (CAM_HEIGHT - 0.8) * camK + 0.6 * (1 - camK) + shake[1],
      state.z - forward[2] * camDist + shake[2],
    ];
    const camLookAt = [state.x + shake[0], 0.8 + shake[1], state.z + shake[2]];
    const view = mat4.lookAt(eye, camLookAt, [0, 1, 0]);
    const viewProj = mat4.multiply(projection, view);
    const writeObject = (d, model, tint, pattern, opacity) =>
      device.queue.writeBuffer(d.uniformBuffer, 0, objectUniformData(viewProj, model, d.material, eye, tint, pattern, opacity));
    const flashI = flash.t > 0 ? FLASH_INTENSITY * (flash.t / FLASH_TIME) ** 2 : 0;
    device.queue.writeBuffer(sceneBuffer, 0, sceneUniformData(lightVP, flash.pos, flashI));
    sky.update(view, FOV_Y, canvas.width / canvas.height);

    const models = tankModelMatrices(state);
    const identity = mat4.identity();

    writeObject(ground, identity);
    writeObject(trees, identity);
    writeObject(chassis, models.chassis);
    if (turret) writeObject(turret, models.turret);
    writeObject(barrel, models.barrel);
    if (flashTimer > 0) {
      writeObject(muzzleFlash, mat4.multiply(models.barrel, mat4.translation(0, 0, -barrelLength())));
    }
    writeObject(trenchDrawable, identity); // malha já em coordenadas de mundo
    writeObject(doorDrawable, identity);
    for (const p of projectiles) writeObject(projectilePool[p.slot], mat4.translation(...p.pos));
    for (const r of rubble) writeObject(rubblePool[r.slot], r.model, r.tint, r.pattern);
    for (const d of debris) {
      writeObject(debrisPool[d.slot], mat4.multiply(mat4.translation(...d.pos),
        mat4.multiply(mat4.rotationY(d.rot[0]), mat4.multiply(mat4.rotationX(d.rot[1]), scaleMatrix(d.size)))),
        d.tint, d.pattern, 1 - Math.min(1, Math.max(0, (d.age - (d.life - DEBRIS_FADE)) / DEBRIS_FADE)));
    }
    for (const e of explosions) {
      const slot = explosionSlots[e.slot];
      const toCam = [eye[0] - e.pos[0], eye[1] - e.pos[1], eye[2] - e.pos[2]];
      const len = Math.hypot(...toCam) || 1;
      // bola de fogo também puxada para a câmera: no portão (dentro da passagem)
      // o arco escondia a metade de cima dela
      const firePos = e.pos.map((v, k) => v + toCam[k] / len * SHOCKWAVE_TOWARD_CAMERA);
      device.queue.writeBuffer(slot.fire.ubo, 0, explosionUniformData(viewProj, view, firePos, e.age, EXPLOSION_QUAD_SIZE));
      const shockPos = firePos;
      device.queue.writeBuffer(slot.shock.ubo, 0, explosionUniformData(viewProj, view, shockPos, e.age, SHOCKWAVE_QUAD_SIZE));
    }

    // Trajetória prevista a partir da mira atual (recalculada todo quadro)
    const aiming = document.pointerLockElement === canvas;
    aimLine.update(viewProj, predictTrajectory(state, isTrenchSolid), aiming ? AIM_LINE_ACTIVE : AIM_LINE_IDLE);

    const encoder = device.createCommandEncoder();

    // 1) Sombras: profundidade de quem projeta sombra, vista do sol
    const sp = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: shadowMapView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    sp.setPipeline(shadowPipeline);
    sp.setBindGroup(1, lightBindGroup);
    for (const d of [chassis, turret, barrel, trees]) if (d) drawObject(sp, d);
    for (const p of projectiles) drawObject(sp, projectilePool[p.slot]);
    for (const r of rubble) drawObject(sp, rubblePool[r.slot]);
    sp.setPipeline(shadowTrenchPipeline);
    sp.setBindGroup(1, lightBindGroup);
    sp.setBindGroup(2, holesBindGroup);
    drawObject(sp, trenchDrawable);
    if (!trench.doorOpen) drawObject(sp, doorDrawable);
    sp.end();

    // 2) Cena vista pela câmera
    const pass = encoder.beginRenderPass({
      colorAttachments: [msaaTexture ? {
        view: msaaTexture.createView(),                         // desenha nas 4 amostras
        resolveTarget: context.getCurrentTexture().createView(), // média vai para o canvas
        clearValue: { r: 0.55, g: 0.68, b: 0.78, a: 1.0 },
        loadOp: "clear",
        storeOp: "discard",                                     // amostras não são mais usadas
      } : {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.55, g: 0.68, b: 0.78, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    // Céu primeiro (atrás de tudo), depois os opacos com a mesma iluminação
    sky.draw(pass);
    pass.setPipeline(pipeline);
    pass.setBindGroup(1, sceneBindGroup);
    drawObject(pass, ground);
    drawObject(pass, trees);
    drawObject(pass, chassis);
    if (turret) drawObject(pass, turret);
    drawObject(pass, barrel);
    if (flashTimer > 0) drawObject(pass, muzzleFlash);
    for (const p of projectiles) drawObject(pass, projectilePool[p.slot]);
    for (const r of rubble) drawObject(pass, rubblePool[r.slot]);
    pass.setPipeline(debrisPipeline);
    pass.setBindGroup(1, sceneBindGroup);
    for (const d of debris) drawObject(pass, debrisPool[d.slot]);
    pass.setPipeline(trenchPipeline);
    pass.setBindGroup(1, sceneBindGroup);
    pass.setBindGroup(2, holesBindGroup);
    drawObject(pass, trenchDrawable);
    if (!trench.doorOpen) drawObject(pass, doorDrawable);

    // Depois dos opacos (trocam de pipeline): linha de mira, bolas de fogo e ondas de choque
    aimLine.draw(pass);
    if (explosions.length > 0) {
      pass.setPipeline(explosionPipeline);
      for (const e of explosions) {
        pass.setBindGroup(0, explosionSlots[e.slot].fire.bindGroup);
        pass.draw(6);
      }
      pass.setPipeline(shockwavePipeline);
      for (const e of explosions) {
        if (e.age > SHOCKWAVE_DURATION) continue;
        pass.setBindGroup(0, explosionSlots[e.slot].shock.bindGroup);
        pass.draw(6);
      }
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  requestAnimationFrame(frame);
}

main().catch(err => {
  setStatus("Erro: " + err.message, false);
  console.error(err);
});
