// ---------- Ponto de entrada: WebGPU, entrada do usuário e loop do jogo ----------
import { mat4 } from "./math.js";
import { buildGround, buildProjectile, buildRock, FLOATS_PER_VERTEX } from "./geometry.js";
import {
  createTrench, resetTrench, trenchHitTest, holeCenter, addHole, trenchDestroyed, trenchFull,
  holesUniformData, buildTrenchMesh, rubbleForHole, HOLES_UNIFORM_BYTES, TRENCH_REBUILD_DESTROYED, randomDebrisTint,
} from "./trench.js";
import {
  buildBoxTank, buildModelTank, buildMuzzleFlash, setTankRig, barrelLength, tankModelMatrices,
} from "./tank.js";
import { loadGLB } from "./gltf.js";
import { bodyForward, moveTank, spawnProjectile, updateProjectiles, predictTrajectory } from "./physics.js";
import { createAimLine } from "./aimLine.js";
import { litShaderCode, objectUniformData, OBJECT_UNIFORM_BYTES, MATERIALS } from "./lighting.js";
import { createSky } from "./sky.js";
import {
  explosionShaderCode, explosionUniformData, EXPLOSION_UNIFORM_BYTES, EXPLOSION_DURATION, SHOCKWAVE_DURATION,
} from "./explosion.js";

// Plano B: false volta para o tanque antigo em caixas (se o modelo der problema).
// Se o carregamento do modelo falhar, o jogo também cai nas caixas sozinho.
const USE_MODEL_3D = true;
// Anti-aliasing: amostras por pixel (MSAA). 1 desliga; 4 é o valor suportado
// por qualquer dispositivo WebGPU.
const SAMPLE_COUNT = 4;
// Teto do devicePixelRatio: telas muito densas (3x) custariam 9x os pixels de
// 1x sem ganho visível aqui. Com 2, o jogo mediu ~52 fps; 1.5 ou menos, ~58-60.
const MAX_PIXEL_RATIO = 2;
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

  // ---------- Pipeline principal (iluminação por pixel, src/lighting.js) ----------
  const shaderModule = device.createShaderModule({ code: litShaderCode });
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }],
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
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: litVertexState,
    fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    multisample: { count: SAMPLE_COUNT },
  });
  // Trincheira: mesmo shader, mas o fragment fs_trench recorta os buracos
  // (lista de impactos no grupo 1, só usado por esta pipeline).
  const holesLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }],
  });
  const trenchPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout, holesLayout] }),
    vertex: litVertexState,
    fragment: { module: shaderModule, entryPoint: "fs_trench", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    multisample: { count: SAMPLE_COUNT },
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
  const muzzleFlash = makeDrawable(buildMuzzleFlash(), MATERIALS.flash);

  // Trincheira: segmentos simples (malha fixa) + lista de buracos num uniform
  // lido pelo fs_trench (src/trench.js e src/lighting.js).
  const trench = createTrench();
  const isTrenchSolid = pos => trenchHitTest(trench, pos);
  const trenchDrawable = makeDrawable(buildTrenchMesh(), MATERIALS.concrete);
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

  // Destroços da explosão (voam com a física dos projéteis): pool fixo
  // mais lascas, menores: 24-32 por impacto, tamanho 0.08-0.16
  const MAX_DEBRIS = 128;
  const DEBRIS_PER_HIT_MIN = 24, DEBRIS_PER_HIT_MAX = 32;
  const DEBRIS_SIZE_MIN = 0.08, DEBRIS_SIZE_MAX = 0.16;
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
  const SHOCKWAVE_QUAD_SIZE = 6.0;
  // O anel é um quad voltado para a câmera; com a câmera no alto, a metade de
  // cima dele "deita" para dentro do muro e o teste de profundidade a esconde.
  // Puxá-lo um pouco na direção da câmera deixa o anel inteiro na frente do muro.
  const SHOCKWAVE_TOWARD_CAMERA = 0.8;
  const SHAKE_DURATION = 0.28;     // tremor de câmera no impacto (s)
  const SHAKE_AMPLITUDE = 0.07;    // deslocamento máximo (unidades de mundo)

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
  const MOUSE_PITCH_SENS = 0.0022;
  const PITCH_MIN = 0.05;
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
  const debris = [];     // {pos, vel, slot, rot:[a,b], spin:[a,b]} — mesma física dos projéteis
  let nextDebrisSlot = 0;
  let shakeTime = 0;
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
      const out = 1.5 + Math.random() * 3.0;   // mais espalhadas
      if (debris.length >= MAX_DEBRIS) debris.shift();
      debris.push({
        pos: [pos[0] + bx * 0.35, pos[1], pos[2] + bz * 0.35],
        vel: [Math.cos(a) * out + bx * 1.5, 2.0 + Math.random() * 3.5, Math.sin(a) * out + bz * 1.5],
        slot: nextDebrisSlot,
        size: DEBRIS_SIZE_MIN + Math.random() * (DEBRIS_SIZE_MAX - DEBRIS_SIZE_MIN),
        tint: randomDebrisTint(),
        pattern: randomPattern(),
        rot: [Math.random() * 6.28, Math.random() * 6.28],
        spin: [(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16],
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
      const center = holeCenter(p.pos, p.vel);
      const hole = addHole(trench, center);
      uploadHoles();
      trenchDamage = trenchDestroyed(trench);
      spawnRubble(rubbleForHole(center, hole.r, p.vel));
      spawnExplosion(p.pos);
      spawnDebris(p.pos, p.vel);
      shakeTime = SHAKE_DURATION;
      setStatus(trenchDamage < TRENCH_REBUILD_DESTROYED && !trenchFull(trench)
        ? `Impacto na trincheira! ${Math.round(trenchDamage * 100)}% destruída`
        : "Trincheira destruída! Uma nova aparece em instantes", true);
    },
    onHitGround() {
      setStatus("Impacto no chão", true);
    },
  };
  // Destroços usam a mesma física dos projéteis, mas atravessam o muro e somem no chão
  const noCollision = () => false;
  const debrisEvents = { onHitTarget() {}, onHitGround() {} };

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

    moveTank(state, keys, dt);
    const forward = bodyForward(state.yaw);

    if (flashTimer > 0) flashTimer -= dt;

    updateProjectiles(projectiles, dt, isTrenchSolid, projectileEvents);
    updateProjectiles(debris, dt, noCollision, debrisEvents);
    for (const d of debris) {
      d.rot[0] += d.spin[0] * dt;
      d.rot[1] += d.spin[1] * dt;
    }

    for (let i = explosions.length - 1; i >= 0; i--) {
      explosions[i].age += dt;
      if (explosions[i].age > EXPLOSION_DURATION) explosions.splice(i, 1);
    }

    // Trincheira quase toda destruída: reconstrói depois que a última explosão acabar
    if (explosions.length === 0 && (trenchDamage >= TRENCH_REBUILD_DESTROYED || trenchFull(trench))) {
      resetTrench(trench);
      uploadHoles();
      trenchDamage = 0;
      rubble.length = 0;
      setStatus("Nova trincheira inimiga!", true);
    }

    // Câmera em terceira pessoa, atrás do corpo do tanque, com tremor no impacto
    let shake = [0, 0, 0];
    if (shakeTime > 0) {
      const amp = SHAKE_AMPLITUDE * (shakeTime / SHAKE_DURATION);
      shake = [Math.sin(elapsed * 83) * amp, Math.sin(elapsed * 61 + 1) * amp, Math.cos(elapsed * 71) * amp];
      shakeTime -= dt;
    }
    const eye = [
      state.x - forward[0] * CAM_DISTANCE + shake[0],
      CAM_HEIGHT + shake[1],
      state.z - forward[2] * CAM_DISTANCE + shake[2],
    ];
    const camLookAt = [state.x + shake[0], 0.8 + shake[1], state.z + shake[2]];
    const view = mat4.lookAt(eye, camLookAt, [0, 1, 0]);
    const viewProj = mat4.multiply(projection, view);
    const writeObject = (d, model, tint, pattern) =>
      device.queue.writeBuffer(d.uniformBuffer, 0, objectUniformData(viewProj, model, d.material, eye, tint, pattern));
    sky.update(view, FOV_Y, canvas.width / canvas.height);

    const models = tankModelMatrices(state);
    const identity = mat4.identity();

    writeObject(ground, identity);
    writeObject(chassis, models.chassis);
    if (turret) writeObject(turret, models.turret);
    writeObject(barrel, models.barrel);
    if (flashTimer > 0) {
      writeObject(muzzleFlash, mat4.multiply(models.barrel, mat4.translation(0, 0, -barrelLength())));
    }
    writeObject(trenchDrawable, identity); // malha já em coordenadas de mundo
    for (const p of projectiles) writeObject(projectilePool[p.slot], mat4.translation(...p.pos));
    for (const r of rubble) writeObject(rubblePool[r.slot], r.model, r.tint, r.pattern);
    for (const d of debris) {
      writeObject(debrisPool[d.slot], mat4.multiply(mat4.translation(...d.pos),
        mat4.multiply(mat4.rotationY(d.rot[0]), mat4.multiply(mat4.rotationX(d.rot[1]), scaleMatrix(d.size)))),
        d.tint, d.pattern);
    }
    for (const e of explosions) {
      const slot = explosionSlots[e.slot];
      device.queue.writeBuffer(slot.fire.ubo, 0, explosionUniformData(viewProj, view, e.pos, e.age, EXPLOSION_QUAD_SIZE));
      const toCam = [eye[0] - e.pos[0], eye[1] - e.pos[1], eye[2] - e.pos[2]];
      const len = Math.hypot(...toCam) || 1;
      const shockPos = e.pos.map((v, k) => v + toCam[k] / len * SHOCKWAVE_TOWARD_CAMERA);
      device.queue.writeBuffer(slot.shock.ubo, 0, explosionUniformData(viewProj, view, shockPos, e.age, SHOCKWAVE_QUAD_SIZE));
    }

    // Trajetória prevista a partir da mira atual (recalculada todo quadro)
    const aiming = document.pointerLockElement === canvas;
    aimLine.update(viewProj, predictTrajectory(state, isTrenchSolid), aiming ? AIM_LINE_ACTIVE : AIM_LINE_IDLE);

    const encoder = device.createCommandEncoder();
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
    drawObject(pass, ground);
    drawObject(pass, chassis);
    if (turret) drawObject(pass, turret);
    drawObject(pass, barrel);
    if (flashTimer > 0) drawObject(pass, muzzleFlash);
    for (const p of projectiles) drawObject(pass, projectilePool[p.slot]);
    for (const d of debris) drawObject(pass, debrisPool[d.slot]);
    for (const r of rubble) drawObject(pass, rubblePool[r.slot]);
    pass.setPipeline(trenchPipeline);
    pass.setBindGroup(1, holesBindGroup);
    drawObject(pass, trenchDrawable);

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
