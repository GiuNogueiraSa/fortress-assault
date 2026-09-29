// ---------- Loader mínimo de glTF binário (.glb) ----------
// Suporta o necessário para um modelo estático: hierarquia de nós
// (matrix ou translation/rotation/scale), malhas com POSITION, NORMAL,
// TEXCOORD_0 (se houver) e índices. Sem animação, esqueleto, morph ou
// extensões. Texturas e materiais são ignorados (as cores vêm do código).
import { mat4, transformPoint, transformDirection } from "./math.js";

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const TYPED = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

export async function loadGLB(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${res.status}`);
  return parseGLB(await res.arrayBuffer());
}

export function parseGLB(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Arquivo não é GLB (magic inválido)");
  let json = null, bin = null;
  for (let off = 12; off < view.byteLength; ) {
    const len = view.getUint32(off, true), type = view.getUint32(off + 4, true);
    const data = buffer.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data)); // "JSON"
    else if (type === 0x004e4942) bin = data;                                   // "BIN\0"
    off += 8 + len;
  }
  if (!json || !bin) throw new Error("GLB sem chunk JSON ou BIN");

  function readAccessor(index) {
    const acc = json.accessors[index];
    const bv = json.bufferViews[acc.bufferView];
    const n = COMPONENTS[acc.type];
    const Typed = TYPED[acc.componentType];
    const elemBytes = n * Typed.BYTES_PER_ELEMENT;
    const stride = bv.byteStride || elemBytes;
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const out = new Typed(acc.count * n);
    for (let i = 0; i < acc.count; i++) {
      out.set(new Typed(bin, base + i * stride, n), i * n); // copia respeitando o stride
    }
    return out;
  }

  function localMatrix(node) {
    if (node.matrix) return new Float32Array(node.matrix);
    const [tx, ty, tz] = node.translation || [0, 0, 0];
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale || [1, 1, 1];
    const rot = new Float32Array([   // quaternion -> matriz (column-major)
      1 - 2*(y*y + z*z), 2*(x*y + z*w),     2*(x*z - y*w),     0,
      2*(x*y - z*w),     1 - 2*(x*x + z*z), 2*(y*z + x*w),     0,
      2*(x*z + y*w),     2*(y*z - x*w),     1 - 2*(x*x + y*y), 0,
      0, 0, 0, 1,
    ]);
    const scale = new Float32Array([sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1]);
    return mat4.multiply(mat4.translation(tx, ty, tz), mat4.multiply(rot, scale));
  }

  // Percorre a cena aplicando a matriz acumulada dos nós; devolve cada
  // primitiva já em coordenadas da cena, como listas de triângulos indexados.
  const primitives = [];
  function visit(nodeIndex, parent) {
    const node = json.nodes[nodeIndex];
    const world = mat4.multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue; // só triângulos
        const pos = readAccessor(prim.attributes.POSITION);
        const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(prim.attributes.NORMAL) : null;
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(prim.attributes.TEXCOORD_0) : null;
        const count = pos.length / 3;
        const indices = prim.indices !== undefined
          ? Uint32Array.from(readAccessor(prim.indices))
          : Uint32Array.from({ length: count }, (_, i) => i);
        const positions = new Float32Array(pos.length);
        const normals = new Float32Array(pos.length);
        for (let i = 0; i < count; i++) {
          positions.set(transformPoint(world, pos.subarray(i*3, i*3 + 3)), i*3);
          if (nrm) {
            // válido para rotação/translação/escala uniforme (caso deste modelo)
            const n = transformDirection(world, nrm.subarray(i*3, i*3 + 3));
            const l = Math.hypot(n[0], n[1], n[2]) || 1;
            normals.set([n[0]/l, n[1]/l, n[2]/l], i*3);
          }
        }
        primitives.push({ name: node.name, positions, normals: nrm ? normals : null, uvs: uv, indices });
      }
    }
    for (const child of node.children || []) visit(child, world);
  }
  const scene = json.scenes[json.scene ?? 0];
  for (const root of scene.nodes) visit(root, mat4.identity());

  return { primitives, asset: json.asset };
}
