// ---------- Ponto de entrada: WebGPU, entrada do usuário e loop do jogo ----------
import { mat4 } from "./math.js";
import { buildGround, buildProjectile } from "./geometry.js";
import {
  createTrench, resetTrench, trenchRemaining, trenchHitTest, carveHole, holeCenter, buildTrenchMesh,
  TRENCH_MAX_FLOATS, TRENCH_REBUILD_BELOW,
} from "./trench.js";
import {
  buildChassis, buildTurretDome, buildBarrel, buildMuzzleFlash,
  BARREL_LENGTH, tankModelMatrices,
} from "./tank.js";
import { aimBasis, moveTank, spawnProjectile, updateProjectiles, predictTrajectory } from "./physics.js";
import { createAimLine } from "./aimLine.js";
import {
  explosionShaderCode, explosionUniformData, EXPLOSION_UNIFORM_BYTES, EXPLOSION_DURATION,
} from "./explosion.js";

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
    : "Clique no canvas para travar o mouse e mirar";
});

function setStatus(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.className = ok ? "status-ok" : "status-bad";
}

const shaderCode = `
  struct Uniforms { mvp: mat4x4f };
  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
  };
  @vertex
  fn vs_main(@location(0) pos: vec3f, @location(1) color: vec3f) -> VertexOut {
    var out: VertexOut;
    out.position = uniforms.mvp * vec4f(pos, 1.0);
    out.color = color;
    return out;
  }
  @fragment
  fn fs_main(in: VertexOut) -> @location(0) vec4f {
    return vec4f(in.color, 1.0);
  }
`;

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

  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  function makeDrawable(vertexData) {
    const vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    const uniformBuffer = device.createBuffer({
      size: 4 * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return { vertexBuffer, uniformBuffer, count: vertexData.length / 6 };
  }

  const ground = makeDrawable(buildGround());
  const chassis = makeDrawable(buildChassis());
  const turret = makeDrawable(buildTurretDome());
  const barrel = makeDrawable(buildBarrel());
  const muzzleFlash = makeDrawable(buildMuzzleFlash());
  // Trincheira: grade de células (src/trench.js). A malha muda a cada buraco,
  // então o vertex buffer é alocado uma vez no tamanho do pior caso e reescrito.
  const trench = createTrench();
  const isTrenchSolid = pos => trenchHitTest(trench, pos);
  const trenchDrawable = {
    vertexBuffer: device.createBuffer({
      size: TRENCH_MAX_FLOATS * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    }),
    uniformBuffer: device.createBuffer({
      size: 4 * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    count: 0,
  };
  function uploadTrenchMesh() {
    const data = buildTrenchMesh(trench);
    device.queue.writeBuffer(trenchDrawable.vertexBuffer, 0, data);
    trenchDrawable.count = data.length / 6;
  }
  uploadTrenchMesh();
  const MAX_PROJECTILES = 8;
  const projectileVerts = buildProjectile();
  const projectilePool = Array.from({ length: MAX_PROJECTILES }, () => makeDrawable(projectileVerts));

  const shaderModule = device.createShaderModule({ code: shaderCode });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
  });
  function makeBindGroup(drawable) {
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: drawable.uniformBuffer } }],
    });
  }
  const groundBG = makeBindGroup(ground);
  const chassisBG = makeBindGroup(chassis);
  const turretBG = makeBindGroup(turret);
  const barrelBG = makeBindGroup(barrel);
  const flashBG = makeBindGroup(muzzleFlash);
  const trenchBG = makeBindGroup(trenchDrawable);
  const projectileBGs = projectilePool.map(makeBindGroup);

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: shaderModule,
      entryPoint: "vs_main",
      buffers: [{
        arrayStride: 6 * 4,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
        ],
      }],
    },
    fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });

  // Pipeline da explosão (shader externo, ver src/explosion.js): quad billboard
  // gerado no vertex shader, sem vertex buffer; pixels fora do efeito são descartados.
  const explosionModule = device.createShaderModule({ code: explosionShaderCode });
  const explosionPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: explosionModule, entryPoint: "vs_main" },
    fragment: { module: explosionModule, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  // Várias explosões ao mesmo tempo (tiros seguidos em pontos diferentes):
  // cada "slot" tem seu próprio uniform buffer, como o pool de projéteis.
  const MAX_EXPLOSIONS = 4;
  const explosionSlots = Array.from({ length: MAX_EXPLOSIONS }, () => {
    const ubo = device.createBuffer({
      size: EXPLOSION_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: explosionPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: ubo } }],
    });
    return { ubo, bindGroup };
  });
  const EXPLOSION_QUAD_SIZE = 3.0; // lado do quad em unidades de mundo

  const aimLine = createAimLine(device, format);
  const AIM_LINE_ACTIVE = [1, 1, 1, 0.55];  // mouse travado (mirando)
  const AIM_LINE_IDLE = [1, 1, 1, 0.15];    // mouse solto: bem discreta

  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const aspect = canvas.width / canvas.height;
  const projection = mat4.perspective(Math.PI / 4, aspect, 0.1, 200);

  // ---------- Estado ----------
  const state = {
    x: 0, z: 1.5,
    aimYaw: 0,                 // direção horizontal (mouse) — também usada pelo chassi e pela torre
    aimPitch: Math.PI / 3,     // elevação do cano (60° inicial, ajustável pelo mouse)
  };
  const MOUSE_YAW_SENS = 0.0022;
  const MOUSE_PITCH_SENS = 0.0022;
  const PITCH_MIN = 0.05;
  const PITCH_MAX = 1.35; // ~77 graus
  const CAM_DISTANCE = 6.5;
  const CAM_HEIGHT = 3.2;

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    state.aimYaw -= e.movementX * MOUSE_YAW_SENS;
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

  function spawnExplosion(pos) {
    if (explosions.length >= MAX_EXPLOSIONS) explosions.shift();
    explosions.push({ pos: [...pos], age: 0, slot: nextExplosionSlot });
    nextExplosionSlot = (nextExplosionSlot + 1) % MAX_EXPLOSIONS;
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
      carveHole(trench, holeCenter(p.pos, p.vel)); // buraco redondo onde o tiro atravessa; o resto fica de pé
      uploadTrenchMesh();
      spawnExplosion(p.pos);
      const destroyed = Math.round((1 - trenchRemaining(trench)) * 100);
      setStatus(trenchRemaining(trench) >= TRENCH_REBUILD_BELOW
        ? `Impacto na trincheira! ${destroyed}% destruída`
        : "Trincheira destruída! Uma nova aparece em instantes", true);
    },
    onHitGround() {
      setStatus("Impacto no chão", true);
    },
  };

  setStatus("WebGPU ativo — clique no canvas para mirar", true);

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    const { forward, right } = aimBasis(state.aimYaw);
    moveTank(state, keys, forward, right, dt);

    if (flashTimer > 0) flashTimer -= dt;

    updateProjectiles(projectiles, dt, isTrenchSolid, projectileEvents);

    for (let i = explosions.length - 1; i >= 0; i--) {
      explosions[i].age += dt;
      if (explosions[i].age > EXPLOSION_DURATION) explosions.splice(i, 1);
    }

    // Trincheira quase toda destruída: reconstrói depois que a última explosão acabar
    if (explosions.length === 0 && trenchRemaining(trench) < TRENCH_REBUILD_BELOW) {
      resetTrench(trench);
      uploadTrenchMesh();
      setStatus("Nova trincheira inimiga!", true);
    }

    // Câmera em terceira pessoa, acompanhando a direção da mira
    const eye = [
      state.x - forward[0] * CAM_DISTANCE,
      CAM_HEIGHT,
      state.z - forward[2] * CAM_DISTANCE,
    ];
    const camLookAt = [state.x, 0.8, state.z];
    const view = mat4.lookAt(eye, camLookAt, [0, 1, 0]);
    const viewProj = mat4.multiply(projection, view);

    const models = tankModelMatrices(state);

    device.queue.writeBuffer(ground.uniformBuffer, 0, viewProj);
    device.queue.writeBuffer(chassis.uniformBuffer, 0, mat4.multiply(viewProj, models.chassis));
    device.queue.writeBuffer(turret.uniformBuffer, 0, mat4.multiply(viewProj, models.turret));
    device.queue.writeBuffer(barrel.uniformBuffer, 0, mat4.multiply(viewProj, models.barrel));
    if (flashTimer > 0) {
      const modelFlash = mat4.multiply(models.barrel, mat4.translation(0, 0, -BARREL_LENGTH));
      device.queue.writeBuffer(muzzleFlash.uniformBuffer, 0, mat4.multiply(viewProj, modelFlash));
    }

    device.queue.writeBuffer(trenchDrawable.uniformBuffer, 0, viewProj); // malha já em coordenadas de mundo
    for (const p of projectiles) {
      const drawable = projectilePool[p.slot];
      device.queue.writeBuffer(drawable.uniformBuffer, 0, mat4.multiply(viewProj, mat4.translation(...p.pos)));
    }
    for (const e of explosions) {
      device.queue.writeBuffer(explosionSlots[e.slot].ubo, 0,
        explosionUniformData(viewProj, view, e.pos, e.age, EXPLOSION_QUAD_SIZE));
    }

    // Trajetória prevista a partir da mira atual (recalculada todo quadro)
    const aiming = document.pointerLockElement === canvas;
    aimLine.update(viewProj, predictTrajectory(state, isTrenchSolid), aiming ? AIM_LINE_ACTIVE : AIM_LINE_IDLE);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
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
    pass.setPipeline(pipeline);

    for (const [bg, d] of [[groundBG, ground], [chassisBG, chassis], [turretBG, turret], [barrelBG, barrel]]) {
      pass.setBindGroup(0, bg);
      pass.setVertexBuffer(0, d.vertexBuffer);
      pass.draw(d.count);
    }
    if (flashTimer > 0) {
      pass.setBindGroup(0, flashBG);
      pass.setVertexBuffer(0, muzzleFlash.vertexBuffer);
      pass.draw(muzzleFlash.count);
    }

    pass.setBindGroup(0, trenchBG);
    pass.setVertexBuffer(0, trenchDrawable.vertexBuffer);
    pass.draw(trenchDrawable.count);

    for (const p of projectiles) {
      pass.setBindGroup(0, projectileBGs[p.slot]);
      pass.setVertexBuffer(0, projectilePool[p.slot].vertexBuffer);
      pass.draw(projectilePool[p.slot].count);
    }

    // Depois dos opacos (trocam de pipeline): linha de mira e explosões
    aimLine.draw(pass);
    if (explosions.length > 0) {
      pass.setPipeline(explosionPipeline);
      for (const e of explosions) {
        pass.setBindGroup(0, explosionSlots[e.slot].bindGroup);
        pass.draw(6);
      }
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch(err => {
  setStatus("Erro: " + err.message, false);
  console.error(err);
});
