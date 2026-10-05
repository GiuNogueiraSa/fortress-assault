// ---------- Ponto de entrada: WebGPU, menu, missões, entrada e loop do jogo ----------
import { mat4 } from "./math.js";
import { buildGround, buildProjectile, buildRock, buildBox, FLOATS_PER_VERTEX } from "./geometry.js";
import {
  createTrench, resetTrench, trenchHitTest, addHole, trenchDestroyed, trenchFull,
  holesUniformData, buildTrenchMesh, rubbleForHole, HOLES_UNIFORM_BYTES, TRENCH_REBUILD_DESTROYED, randomDebrisTint,
  tankBlocked, DOOR_HP, sectorIntegrity, castleBounds, towerMuzzles,
} from "./trench.js";
import { MISSIONS, unlockMission } from "./missions.js";
import { createMenu } from "./menu.js";
import {
  showHud, setMissionTitle, setSectors, setHP, setAmmo, setTimer, setEnemiesLeft, toast, updateToast, drawMinimap,
} from "./hud.js";
import { aimAt, createEnemyTanks, enemyTankHit, shotHitsPlayer } from "./enemies.js";
import {
  buildBoxTank, buildModelTank, buildMuzzleFlash, setTankRig, barrelLength, tankModelMatrices,
} from "./tank.js";
import { loadGLB } from "./gltf.js";
import { bodyForward, moveTankSmooth, spawnProjectile, updateProjectiles, predictTrajectory, stepProjectile } from "./physics.js";
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
    ? "Câmera ativa — Esc solta o mouse"
    : "Clique para travar o mouse (câmera 360°)";
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
  // Tanques inimigos (missão 3): mesmas malhas do tanque do jogador, cor avermelhada e sem onça
  const ENEMY_TINT = [0.78, 0.25, 0.22];
  const shareMesh = (src, material) => { const d = makeDrawable(null, material); useMesh(d, { buffer: src.vertexBuffer, count: src.count }); return d; };
  const enemyDrawables = Array.from({ length: 3 }, () => ({
    chassis: shareMesh(chassis, MATERIALS.tankPaint),
    turret: turret ? shareMesh(turret, MATERIALS.tankPaint) : null,
    barrel: shareMesh(barrel, MATERIALS.metal),
  }));

  const ground = makeDrawable(buildGround(), MATERIALS.ground);
  const trees = makeDrawable(buildTrees(), MATERIALS.foliage);   // fundo, atrás da fortaleza
  const muzzleFlash = makeDrawable(buildMuzzleFlash(), MATERIALS.flash);

  // Trincheira: segmentos simples (malha fixa) + lista de buracos num uniform
  // lido pelo fs_trench (src/trench.js e src/lighting.js).
  let trench = createTrench();   // recriado a cada missão (escala, resistência)
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
  // tiros inimigos: cubinho laranja emissivo (fácil de ver e desviar)
  const MAX_ENEMY_SHOTS = 12;
  const enemyShellMesh = makeMesh(new Float32Array(buildBox(0.26, 0.26, 0.26, [0, 0, 0], [1.0, 0.45, 0.1])));
  const enemyShotPool = Array.from({ length: MAX_ENEMY_SHOTS }, () => {
    const d = makeDrawable(null, MATERIALS.flash); useMesh(d, enemyShellMesh); return d;
  });

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

  // ---------- Estado do jogador ----------
  const state = {
    x: 0, z: 1.5,
    yaw: 0,              // direção do corpo (A/D); torre e cano seguem junto
    aimPitch: 0.35,      // elevação do cano (setas ↑/↓)
    vel: 0, turnVel: 0,  // inércia (moveTankSmooth)
  };
  // câmera em órbita ao redor do tanque (mouse): ângulo relativo ao corpo e elevação
  const cam = { yaw: 0, pitch: 0.36 };
  const MOUSE_CAM_SENS = 0.003;
  const PITCH_SPEED = 0.9;          // rad/s com as setas
  // o cano pode apontar um pouco para baixo (~ -9°): de perto, sem isso o tiro
  // sai na altura da boca (~1.5) e não dá para abrir brecha rente ao chão
  const PITCH_MIN = -0.15;
  const PITCH_MAX = 1.35;           // ~77 graus
  const CAM_DISTANCE = 6.5;

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas || mode !== "playing") return;
    cam.yaw -= e.movementX * MOUSE_CAM_SENS;
    cam.pitch = Math.max(-0.05, Math.min(1.35, cam.pitch + e.movementY * MOUSE_CAM_SENS));
  });

  // ---------- Missão em andamento ----------
  let mode = "menu";            // "menu" | "playing" | "paused" | "victory" | "defeat"
  let missionIndex = 0;
  let mission = MISSIONS[0];
  let ammoLeft = Infinity, hp = 1, timeLeft = 0, alertedLowTime = false;
  let enemies = [];
  let towerTimer = 0, towerTurn = 0, playerHasFired = false, playerAlive = true;
  let stats = { shots: 0, damage: 0 };
  let endTimer = 0;             // espera um pouco antes de mostrar a tela final
  let victoryFly = null;        // animação da câmera entrando no castelo
  let menuAngle = 0;
  window.__game = { state, get trench() { return trench; }, get mode() { return mode; }, get hp() { return hp; },
                    get ammo() { return ammoLeft; }, get enemies() { return enemies; } };

  const enemyShots = [];        // {pos, vel, slot}
  let nextEnemyShot = 0;

  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    if (k === "m" || (k === "escape" && document.pointerLockElement !== canvas)) {
      if (mode === "playing") pauseGame();
      else if (mode === "paused") resumeGame();
      return;
    }
    keys.add(k);
    if (e.key === " " && mode === "playing") fire();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  // som curto (alerta de tempo), sem arquivos: oscilador do WebAudio
  let audio = null;
  function beep(freq = 880, dur = 0.12) {
    try {
      audio = audio || new AudioContext();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; g.gain.value = 0.08;
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch { /* sem áudio: segue sem som */ }
  }

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
  // explosão completa num ponto (fogo, lascas, tremor, clarão)
  function blast(pos, vel, tintFn = randomDebrisTint) {
    spawnExplosion(pos);
    spawnDebris(pos, vel, tintFn);
    shakeTime = SHAKE_DURATION;
    shakePhase = Math.random() * 100;
    flash.pos = [pos[0] - vel[0] * 0.05, pos[1] + 0.3, pos[2] - vel[2] * 0.05];
    flash.t = FLASH_TIME;
  }

  // Lascas saindo do impacto em direções aleatórias, com viés para trás do tiro
  function spawnDebris(pos, shotVel, tintFn = randomDebrisTint) {
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
        tint: tintFn(),
        pattern: randomPattern(),
        rot: [Math.random() * 6.28, Math.random() * 6.28],
        spin: [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20],
      });
      useMesh(debrisPool[nextDebrisSlot], randomChip());
      nextDebrisSlot = (nextDebrisSlot + 1) % MAX_DEBRIS;
    }
  }
  const metalTint = () => { const k = 0.5 + Math.random() * 0.6; return [1.1 * k, 0.35 * k, 0.3 * k]; };

  function fire() {
    const now = performance.now();
    if (now - lastShotAt < 250 || !playerAlive) return; // limite simples de taxa de tiro
    if (ammoLeft <= 0) { toast("SEM MUNIÇÃO"); return; }
    lastShotAt = now;
    flashTimer = 0.08;
    if (ammoLeft !== Infinity) ammoLeft--;
    stats.shots++;
    playerHasFired = true;
    if (projectiles.length >= MAX_PROJECTILES) projectiles.shift();
    projectiles.push({ ...spawnProjectile(state), slot: nextSlot });
    nextSlot = (nextSlot + 1) % MAX_PROJECTILES;
    setStatus("Tiro disparado", true);
  }

  // o tiro do jogador bate no castelo OU num tanque inimigo vivo
  const isPlayerTargetSolid = pos => isTrenchSolid(pos) || enemyTankHit(enemies, pos) !== null;
  const projectileEvents = {
    onHitTarget(p) {
      const enemy = enemyTankHit(enemies, p.pos);
      if (enemy) {
        enemy.alive = false;
        blast([enemy.x, 1.0, enemy.z], p.vel, metalTint);
        spawnExplosion([enemy.x + 0.6, 1.4, enemy.z + 0.3]);
        setStatus("Tanque inimigo destruído!", true);
        toast("TANQUE INIMIGO DESTRUÍDO");
        return;
      }
      // castelo: buraco irregular onde o tiro atravessa, borda queimada, entulho no chão
      const b = trenchHitTest(trench, p.pos);
      const { hole, doorFell } = addHole(trench, p.pos, p.vel, b);
      uploadHoles();
      if (hole && !b.door) spawnRubble(rubbleForHole(hole));
      blast(p.pos, p.vel);
      if (doorFell) {
        spawnDebris([0, 1.5 * trench.scale, trench.door.max[2] * trench.scale], p.vel);
        spawnRubble(rubbleForHole({ c: [0, 0, (trench.door.min[2] + trench.door.max[2]) / 2], d: [0, 0, -1], r: 1.4, scale: trench.scale }));
        setStatus("Portão derrubado!", true);
      } else if (b.door) {
        setStatus(`Portão atingido: ${trench.doorHits}/${trench.doorHP}`, true);
      } else {
        setStatus("Impacto no castelo!", true);
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

  // ---------- Inimigos: tiros das torres e dos tanques ----------
  function enemyFire(from, lead, spread) {
    const tankVel = bodyForward(state.yaw).map(c => c * state.vel);
    const vel = aimAt(from, [state.x, 0, state.z], tankVel, { lead, spread });
    if (enemyShots.length >= MAX_ENEMY_SHOTS) enemyShots.shift();
    enemyShots.push({ pos: [...from], vel, slot: nextEnemyShot });
    nextEnemyShot = (nextEnemyShot + 1) % MAX_ENEMY_SHOTS;
  }
  function damagePlayer(pos) {
    hp = Math.max(0, hp - 1 / mission.tankHits);
    stats.damage = 1 - hp;
    blast(pos, [0, 0, -1], metalTint);
    toast(`⚠ IMPACTO! Saúde: ${Math.round(hp * 100)}%`);
    if (hp <= 0 && playerAlive) {
      playerAlive = false;
      blast([state.x, 1.2, state.z], [0, 0, -1], metalTint);
      spawnExplosion([state.x + 0.5, 1.6, state.z - 0.4]);
      lose("TANQUE DESTRUÍDO — DERROTA");
    }
  }
  function updateEnemies(dt) {
    // torres contra-atacam (depois do primeiro tiro do jogador), alternando, se ainda de pé
    if (mission.towerFireInterval > 0 && playerHasFired) {
      towerTimer -= dt;
      if (towerTimer <= 0) {
        const integ = sectorIntegrity(trench);
        const muzzles = towerMuzzles(trench);
        const alive = [integ.left > 0 ? 0 : -1, integ.right > 0 ? 1 : -1].filter(i => i >= 0);
        if (alive.length) {
          const i = alive[towerTurn++ % alive.length];
          enemyFire(muzzles[i], mission.towerLead, mission.towerLead ? 0.6 : 1.8);
        }
        towerTimer = mission.towerFireInterval;
      }
    }
    // tanques inimigos: viram para o jogador e atiram de tempos em tempos
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = state.x - e.x, dz = state.z - e.z;
      e.yaw = Math.atan2(-dx, -dz);
      e.cooldown -= dt;
      if (e.cooldown <= 0 && Math.hypot(dx, dz) < 45) {
        const f = bodyForward(e.yaw);
        enemyFire([e.x + f[0] * 1.3, 1.45, e.z + f[2] * 1.3], true, 1.0);
        e.cooldown = mission.enemyFireInterval || 2.5;
      }
    }
    // tiros inimigos: mesma gravidade; acertam o tanque ou o chão
    for (let i = enemyShots.length - 1; i >= 0; i--) {
      const s = enemyShots[i];
      stepProjectile(s, dt);
      if (playerAlive && shotHitsPlayer(s.pos, [state.x, 0, state.z])) {
        damagePlayer(s.pos);
        enemyShots.splice(i, 1);
      } else if (s.pos[1] <= 0.08) {
        spawnExplosion([s.pos[0], 0.3, s.pos[2]]);
        enemyShots.splice(i, 1);
      } else if (Math.hypot(s.pos[0] - state.x, s.pos[2] - state.z) > 150) {
        enemyShots.splice(i, 1);
      }
    }
  }

  // ---------- Fluxo: começar, pausar, vencer, perder ----------
  function startMission(i) {
    missionIndex = i;
    mission = MISSIONS[i];
    trench = createTrench({ scale: mission.castleScale, doorHP: mission.doorHP, sectorHits: mission.sectorHits });
    uploadHoles();
    for (const arr of [projectiles, debris, rubble, explosions, enemyShots]) arr.length = 0;
    Object.assign(state, { x: 0, z: 1.5, yaw: 0, aimPitch: 0.35, vel: 0, turnVel: 0 });
    Object.assign(cam, { yaw: 0, pitch: 0.36 });
    ammoLeft = mission.ammo;
    hp = 1;
    timeLeft = mission.timeLimit;
    alertedLowTime = false;
    enemies = createEnemyTanks(mission.enemyTanks);
    towerTimer = 1.5; towerTurn = 0;
    playerHasFired = false; playerAlive = true;
    stats = { shots: 0, damage: 0 };
    endTimer = 0; victoryFly = null;
    setMissionTitle(mission.title);
    setStatus(mission.id === 1 ? "Destrua os 3 setores da fortaleza" : "Cuidado: as defesas atiram de volta!", true);
    setHP(1, mission.tankHits > 0 && mission.id > 1);
    showHud(true);
    menu.close();
    mode = "playing";
  }
  function pauseGame() {
    mode = "paused";
    if (document.pointerLockElement) document.exitPointerLock();
    menu.open(true);
  }
  function resumeGame() {
    mode = "playing";
    menu.close();
  }
  function goMenu() {
    mode = "menu";
    showHud(false);
    menu.open(false);
  }
  function lose(text) {
    if (mode !== "playing") return;
    mode = "defeat";
    endTimer = 1.6;
    pendingEnd = () => menu.end(text, false, `Tiros: ${stats.shots} · Dano sofrido: ${Math.round(stats.damage * 100)}%`, [
      { label: "Tentar de novo", primary: true, action: () => startMission(missionIndex) },
      { label: "Menu", action: goMenu },
    ]);
  }
  function win() {
    mode = "victory";
    unlockMission(missionIndex + 2);
    if (document.pointerLockElement) document.exitPointerLock();
    // câmera voa para dentro do pátio em 2 s
    const s = trench.scale;
    victoryFly = { t: 0, from: null, to: [0, 4.2 * s, -11.6 * s], look: [0, 1.0 * s, -15.5 * s] };
    endTimer = 2.4;
    const last = missionIndex === MISSIONS.length - 1;
    const lines = [];
    if (mission.timeLimit) lines.push(`Tempo restante: ${Math.ceil(timeLeft)}s`);
    if (mission.ammo !== Infinity) lines.push(`Munição restante: ${ammoLeft}`);
    if (mission.id > 1) lines.push(`Dano sofrido: ${Math.round(stats.damage * 100)}%`);
    lines.push(`Tiros: ${stats.shots}`);
    pendingEnd = () => menu.end(mission.victoryText, true, lines.join(" · "), last
      ? [{ label: "Menu principal", primary: true, action: goMenu }]
      : [{ label: "Próxima missão", primary: true, action: () => startMission(missionIndex + 1) },
         { label: "Menu", action: goMenu }]);
  }
  let pendingEnd = null;

  function updateMission(dt) {
    const integ = sectorIntegrity(trench);
    setSectors(integ.left, integ.gate, integ.right);
    setHP(hp, mission.id > 1);
    setAmmo(ammoLeft, mission.ammo);
    setTimer(mission.timeLimit ? timeLeft : null);
    setEnemiesLeft(mission.enemyTanks.length ? enemies.filter(e => e.alive).length : null);
    if (mode !== "playing") return;
    if (mission.timeLimit) {
      timeLeft -= dt;
      if (timeLeft <= 30 && !alertedLowTime) { alertedLowTime = true; beep(880, 0.15); setTimeout(() => beep(660, 0.2), 220); toast("30 SEGUNDOS!"); }
      if (timeLeft <= 0) { lose("TEMPO ESGOTADO — DERROTA"); return; }
    }
    const castleDown = integ.left <= 0 && integ.gate <= 0 && integ.right <= 0;
    const enemiesDown = enemies.every(e => !e.alive);
    if (castleDown && enemiesDown) { win(); return; }
    if (ammoLeft <= 0 && projectiles.length === 0) lose("MUNIÇÃO ACABOU — DERROTA");
  }

  const menu = createMenu({ onStart: startMission, onResume: resumeGame });
  menu.open(false);
  setStatus(usingModel || !USE_MODEL_3D ? "WebGPU ativo" : "Modelo 3D falhou — usando o tanque em caixas (ver console)",
    usingModel || !USE_MODEL_3D);

  // tanque do jogador bloqueado pelo castelo ou por tanques inimigos
  const isPlayerBlocked = (x, z) =>
    isTankBlocked(x, z) || enemies.some(e => e.alive && Math.hypot(x - e.x, z - e.z) < 2.2);

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
    resizeRenderTargets();
    updateToast(dt);

    const active = mode === "playing" || mode === "victory" || mode === "defeat";
    if (mode === "playing" && playerAlive) {
      if (keys.has("arrowup")) state.aimPitch = Math.min(PITCH_MAX, state.aimPitch + PITCH_SPEED * dt);
      if (keys.has("arrowdown")) state.aimPitch = Math.max(PITCH_MIN, state.aimPitch - PITCH_SPEED * dt);
      moveTankSmooth(state, keys, dt, isPlayerBlocked);
    } else {
      state.vel = 0; state.turnVel = 0;
    }
    if (active) {
      updateProjectiles(projectiles, dt, isPlayerTargetSolid, projectileEvents);
      if (mode === "playing") updateEnemies(dt);
      updateDebris(dt);
      for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].age += dt;
        explosions[i].pos[1] += FIREBALL_RISE * dt;
        if (explosions[i].age > EXPLOSION_DURATION) explosions.splice(i, 1);
      }
      updateMission(dt);
      if (endTimer > 0) {
        endTimer -= dt;
        if (endTimer <= 0 && pendingEnd) { pendingEnd(); pendingEnd = null; }
      }
    }
    if (flashTimer > 0) flashTimer -= dt;
    if (flash.t > 0) flash.t -= dt;
    const forward = bodyForward(state.yaw);

    // ---------- Câmera ----------
    let eye, camLookAt;
    const cs = trench.scale;
    if (mode === "menu") {
      // menu: câmera dá voltas no castelo ao pôr do sol
      menuAngle += dt * 0.07;
      const c = castleBounds(trench).centerZ;
      eye = [Math.sin(menuAngle) * 34 * cs, 9 * cs, c + Math.cos(menuAngle) * 34 * cs];
      camLookAt = [0, 5 * cs, c];
    } else if (mode === "victory" && victoryFly) {
      // vitória: voa para dentro do pátio (2 s, suavizado)
      victoryFly.t = Math.min(1, victoryFly.t + dt / 2);
      const k = victoryFly.t * victoryFly.t * (3 - 2 * victoryFly.t);
      if (!victoryFly.from) victoryFly.from = { eye: lastEye || [0, 3, 8], look: lastLook || [0, 1, 0] };
      eye = victoryFly.from.eye.map((v, i) => v + (victoryFly.to[i] - v) * k);
      camLookAt = victoryFly.from.look.map((v, i) => v + (victoryFly.look[i] - v) * k);
    } else {
      // jogo: órbita ao redor do tanque (mouse), com tremor no impacto
      let shake = [0, 0, 0];
      if (shakeTime > 0) {
        const k = shakeTime / SHAKE_DURATION;
        const amp = SHAKE_AMPLITUDE * k * k;   // decai suave (quadrático)
        const sx = Math.sin(elapsed * 85 + shakePhase) * amp, sy = Math.cos(elapsed * 67 + shakePhase * 1.7) * amp;
        const right = [-forward[2], 0, forward[0]];
        shake = [right[0] * sx, sy, right[2] * sx];
        shakeTime -= dt;
      }
      const camDir = bodyForward(state.yaw + cam.yaw);    // para onde a câmera "olha" no plano
      const cp = Math.cos(cam.pitch), spch = Math.sin(cam.pitch);
      // se uma parede fica entre o tanque e a câmera, a câmera chega mais perto
      let camDist = CAM_DISTANCE;
      for (let d = 0.6; d <= CAM_DISTANCE; d += 0.25) {
        const probe = [state.x - camDir[0] * d * cp, 0.8 + d * spch, state.z - camDir[2] * d * cp];
        if (isTrenchSolid(probe)) { camDist = Math.max(0.6, d - 0.35); break; }
      }
      eye = [
        state.x - camDir[0] * camDist * cp + shake[0],
        Math.max(0.3, 0.8 + camDist * spch) + shake[1],
        state.z - camDir[2] * camDist * cp + shake[2],
      ];
      camLookAt = [state.x + shake[0], 0.8 + shake[1], state.z + shake[2]];
    }
    lastEye = eye; lastLook = camLookAt;
    const view = mat4.lookAt(eye, camLookAt, [0, 1, 0]);
    const viewProj = mat4.multiply(projection, view);
    const writeObject = (d, model, tint, pattern, opacity, damage) =>
      device.queue.writeBuffer(d.uniformBuffer, 0, objectUniformData(viewProj, model, d.material, eye, tint, pattern, opacity, damage));
    const flashI = flash.t > 0 ? FLASH_INTENSITY * (flash.t / FLASH_TIME) ** 2 : 0;
    const glow = mode === "victory" && victoryFly ? victoryFly.t : 0;
    device.queue.writeBuffer(sceneBuffer, 0, sceneUniformData(lightVP, flash.pos, flashI, cs, mission.ivyBoost, glow));
    sky.update(view, FOV_Y, canvas.width / canvas.height);

    if (mode !== "menu") {
      drawMinimap({ tank: state, enemies, castle: castleBounds(trench) });
    }

    const models = tankModelMatrices(state);
    const identity = mat4.identity();
    const castleModel = scaleMatrix(cs);

    writeObject(ground, identity);
    writeObject(trees, identity);
    writeObject(chassis, models.chassis, undefined, undefined, 1, 1 - hp);
    if (turret) writeObject(turret, models.turret, undefined, undefined, 1, 1 - hp);
    writeObject(barrel, models.barrel, undefined, undefined, 1, 1 - hp);
    if (flashTimer > 0) {
      writeObject(muzzleFlash, mat4.multiply(models.barrel, mat4.translation(0, 0, -barrelLength())));
    }
    writeObject(trenchDrawable, castleModel);   // castelo na escala da missão
    writeObject(doorDrawable, castleModel);
    for (const p of projectiles) writeObject(projectilePool[p.slot], mat4.translation(...p.pos));
    for (const s of enemyShots) writeObject(enemyShotPool[s.slot], mat4.translation(...s.pos));
    const liveEnemies = enemies.filter(e => e.alive);
    liveEnemies.forEach((e, i) => {
      const m = tankModelMatrices({ x: e.x, z: e.z, yaw: e.yaw, aimPitch: 0.25 });
      const d = enemyDrawables[i];
      writeObject(d.chassis, m.chassis, ENEMY_TINT, 0);
      if (d.turret) writeObject(d.turret, m.turret, ENEMY_TINT, 0);
      writeObject(d.barrel, m.barrel);
    });
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
      // bola de fogo puxada para a câmera: dentro da passagem do portão o arco a escondia
      const firePos = e.pos.map((v, k) => v + toCam[k] / len * SHOCKWAVE_TOWARD_CAMERA);
      device.queue.writeBuffer(slot.fire.ubo, 0, explosionUniformData(viewProj, view, firePos, e.age, EXPLOSION_QUAD_SIZE));
      device.queue.writeBuffer(slot.shock.ubo, 0, explosionUniformData(viewProj, view, firePos, e.age, SHOCKWAVE_QUAD_SIZE));
    }

    // Trajetória prevista a partir da mira atual (só jogando)
    const showAim = mode === "playing" && playerAlive;
    if (showAim) {
      const aiming = document.pointerLockElement === canvas;
      aimLine.update(viewProj, predictTrajectory(state, isPlayerTargetSolid), aiming ? AIM_LINE_ACTIVE : AIM_LINE_IDLE);
    }

    const encoder = device.createCommandEncoder();

    // 1) Sombras: profundidade de quem projeta sombra, vista do sol
    const sp = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: shadowMapView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    sp.setPipeline(shadowPipeline);
    sp.setBindGroup(1, lightBindGroup);
    if (playerAlive) for (const d of [chassis, turret, barrel]) if (d) drawObject(sp, d);
    drawObject(sp, trees);
    liveEnemies.forEach((e, i) => { const d = enemyDrawables[i]; for (const p of [d.chassis, d.turret, d.barrel]) if (p) drawObject(sp, p); });
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
    if (playerAlive) {
      drawObject(pass, chassis);
      if (turret) drawObject(pass, turret);
      drawObject(pass, barrel);
    }
    liveEnemies.forEach((e, i) => { const d = enemyDrawables[i]; for (const p of [d.chassis, d.turret, d.barrel]) if (p) drawObject(pass, p); });
    if (flashTimer > 0) drawObject(pass, muzzleFlash);
    for (const p of projectiles) drawObject(pass, projectilePool[p.slot]);
    for (const s of enemyShots) drawObject(pass, enemyShotPool[s.slot]);
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
    if (showAim) aimLine.draw(pass);
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
  let lastEye = null, lastLook = null;
  requestAnimationFrame(frame);
}

main().catch(err => {
  setStatus("Erro: " + err.message, false);
  console.error(err);
});
