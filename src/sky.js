// ---------- Céu com sol ----------
// Triângulo em tela cheia desenhado ANTES da cena, sem escrever profundidade
// (os objetos ficam por cima). Para cada pixel monta a direção de visão a
// partir dos eixos da câmera e pinta um gradiente (laranja no horizonte, azul
// no alto) mais o disco do sol com um halo, na direção SUN_DISC_DIR.
import { SUN_DISC_DIR, HORIZON_COLOR } from "./lighting.js";

const v3 = v => `vec3f(${v.map(x => x.toFixed(5)).join(", ")})`;

const skyShaderCode = /* wgsl */ `
struct Sky {
  right: vec4f,     // xyz: eixo direita da câmera, w: tan(fov/2) * aspecto
  up: vec4f,        // xyz: eixo cima,            w: tan(fov/2)
  forward: vec4f,   // xyz: para onde a câmera olha
};
@group(0) @binding(0) var<uniform> sky: Sky;

struct VOut {
  @builtin(position) position: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs_sky(@builtin(vertex_index) i: u32) -> VOut {
  // um triângulo grande que cobre a tela inteira
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VOut;
  out.position = vec4f(p[i], 1.0, 1.0);   // no plano mais distante
  out.ndc = p[i];
  return out;
}

const SUN_DIR = ${v3(SUN_DISC_DIR)};
const HORIZON = ${v3(HORIZON_COLOR)};
const ZENITH = vec3f(0.33, 0.58, 0.93);
const BELOW = vec3f(0.55, 0.47, 0.40);      // abaixo do horizonte (além do chão)
const SUN_COLOR = vec3f(1.0, 0.86, 0.55);

@fragment
fn fs_sky(in: VOut) -> @location(0) vec4f {
  let dir = normalize(sky.forward.xyz + in.ndc.x * sky.right.w * sky.right.xyz + in.ndc.y * sky.up.w * sky.up.xyz);
  let e = dir.y;
  var col = mix(HORIZON, ZENITH, smoothstep(0.0, 0.45, e));
  col = mix(col, BELOW, smoothstep(0.0, -0.08, e));
  // sol: disco nítido + halo largo + brilho amplo no céu em volta
  let c = max(dot(dir, normalize(SUN_DIR)), 0.0);
  let disc = smoothstep(0.99920, 0.99945, c);
  let halo = pow(c, 220.0) * 0.55 + pow(c, 18.0) * 0.22;
  col = col + SUN_COLOR * halo;
  col = mix(col, vec3f(1.0, 0.97, 0.88), disc);
  return vec4f(col, 1.0);
}
`;

export const SKY_UNIFORM_BYTES = 48;

export function createSky(device, format, sampleCount) {
  const module = device.createShaderModule({ code: skyShaderCode });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs_sky" },
    fragment: { module, entryPoint: "fs_sky", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
    // atrás de tudo: não testa nem escreve profundidade
    depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" },
    multisample: { count: sampleCount },
  });
  const buffer = device.createBuffer({ size: SKY_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  });
  return {
    // eixos da câmera saem das linhas da matriz view (lookAt): direita, cima e -frente
    update(view, fovY, aspect) {
      const t = Math.tan(fovY / 2);
      device.queue.writeBuffer(buffer, 0, new Float32Array([
        view[0], view[4], view[8], t * aspect,
        view[1], view[5], view[9], t,
        -view[2], -view[6], -view[10], 0,
      ]));
    },
    draw(pass) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
    },
  };
}
