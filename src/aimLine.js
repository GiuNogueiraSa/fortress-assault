// ---------- Linha de mira (trajetória prevista) ----------
// Pipeline separada com topologia "line-strip": só posição, cor sólida via uniform.
import { PREDICT_MAX_POINTS } from "./physics.js";

const aimLineShaderCode = `
  struct Uniforms { viewProj: mat4x4f, color: vec4f };
  @group(0) @binding(0) var<uniform> u: Uniforms;
  @vertex
  fn vs_main(@location(0) pos: vec3f) -> @builtin(position) vec4f {
    return u.viewProj * vec4f(pos, 1.0);
  }
  @fragment
  fn fs_main() -> @location(0) vec4f {
    return u.color;
  }
`;

// Anel horizontal no ponto de queda: vista de trás, a parábola fica "de perfil"
// para a câmera e o fim da linha some atrás do cano — o anel mostra onde cai.
const RING_SEGMENTS = 16;
const RING_RADIUS = 0.3;
const MAX_POINTS = PREDICT_MAX_POINTS + RING_SEGMENTS + 1;

function appendLandingRing(points) {
  const n = points.length;
  const [x, y, z] = [points[n-3], points[n-2], points[n-1]];
  // começa na borda do anel para o "raio" que liga a linha ao anel ficar curto e alinhado
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    points.push(x + Math.cos(a) * RING_RADIUS, y, z + Math.sin(a) * RING_RADIUS);
  }
  return points;
}

export function createAimLine(device, format, sampleCount = 1) {
  const module = device.createShaderModule({ code: aimLineShaderCode });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vs_main",
      buffers: [{ arrayStride: 3 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }],
    },
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [{
        format,
        // Mistura a cor pela transparência, mas mantém o alpha do canvas em 1
        // (senão, com alphaMode "premultiplied", a linha "furaria" o canvas).
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
          alpha: { srcFactor: "zero", dstFactor: "one" },
        },
      }],
    },
    primitive: { topology: "line-strip" },
    multisample: { count: sampleCount },
    // Some atrás do tanque/trincheira, mas não escreve profundidade (é só um guia)
    depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "less" },
  });
  const vertexBuffer = device.createBuffer({
    size: MAX_POINTS * 3 * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const uniformBuffer = device.createBuffer({
    size: (16 + 4) * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  let count = 0;

  return {
    // points = [x,y,z, x,y,z, ...] (saída de predictTrajectory); color = [r,g,b,a]
    update(viewProj, points, color) {
      const all = appendLandingRing(points.slice(0, PREDICT_MAX_POINTS * 3));
      count = all.length / 3;
      device.queue.writeBuffer(vertexBuffer, 0, new Float32Array(all));
      const u = new Float32Array(20);
      u.set(viewProj, 0);
      u.set(color, 16);
      device.queue.writeBuffer(uniformBuffer, 0, u);
    },
    draw(pass) {
      if (count < 2) return;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.draw(count);
    },
  };
}
