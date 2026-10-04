// ---------- Cenário de fundo: árvores ----------
// Árvores simples (tronco cilíndrico + copa de esferas achatadas, normais
// suaves) atrás e dos lados da fortaleza, só para dar profundidade.
// Malha única em coordenadas de mundo; projeta sombra como o resto.
import { buildCylinderY, buildSphere } from "./geometry.js";

const TRUNK = [0.05, 0.15, 0.06];     // verde escuro (paleta pedida)
const LEAVES = [0.10, 0.25, 0.08];    // verde mais claro

// x, z, altura do tronco, raio da copa
const TREES = [
  [-15.5, -21, 4.5, 2.6],
  [-8.5, -25, 5.5, 3.0],
  [7.5, -26, 5.0, 3.2],
  [15.0, -20, 4.0, 2.4],
  [17.5, -11, 3.5, 2.2],
];

export function buildTrees() {
  let v = [];
  for (const [x, z, h, r] of TREES) {
    v = v.concat(buildCylinderY(0.35, h + r * 0.6, [x, 0, z], TRUNK, 10));
    // copa: três esferas achatadas sobrepostas (mais orgânico que uma só)
    v = v.concat(buildSphere(r, [x, h + r * 0.7, z], LEAVES, [1, 0.85, 1]));
    v = v.concat(buildSphere(r * 0.7, [x + r * 0.5, h + r * 0.35, z + r * 0.2], LEAVES, [1, 0.8, 1]));
    v = v.concat(buildSphere(r * 0.65, [x - r * 0.45, h + r * 0.45, z - r * 0.3], LEAVES, [1, 0.8, 1]));
  }
  return new Float32Array(v);
}
