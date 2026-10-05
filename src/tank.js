// ---------- Tanque: geometria + hierarquia de transformações ----------
// Duas versões da geometria, com a MESMA hierarquia chassi -> torre -> cano:
//   - modelo 3D (assets/models/tank.glb), padrão;
//   - caixas procedurais antigas (plano B, USE_MODEL_3D = false em main.js).
// Cada versão tem seu "rig": pivô da torre, encaixe e comprimento do cano.
// tankModelMatrices() (desenho, disparo e linha de mira) usa o rig ativo.
import { mat4 } from "./math.js";
import { buildBox, buildCylinderX } from "./geometry.js";

// Cores sobrescritas do modelo 3D (a textura original é ignorada). A estampa
// de onça é aplicada por cima do amarelo no fragment shader (lighting.js).
export const TANK_BODY_COLOR = [0.95, 0.85, 0.10];   // casco e torre: amarelo
export const TANK_DETAIL_COLOR = [0.08, 0.08, 0.09]; // cano, esteiras, rodas: quase preto

// ---------- Versão em caixas (plano B) ----------
export function buildChassis() {
  let verts = [];
  const trackColor = [0.10, 0.10, 0.11];
  verts = verts.concat(buildBox(0.32, 0.32, 2.0, [-0.72, 0.16, 0], trackColor));
  verts = verts.concat(buildBox(0.32, 0.32, 2.0, [ 0.72, 0.16, 0], trackColor));
  const wheelColor = [0.05, 0.05, 0.06];
  const wheelZs = [-0.70, -0.23, 0.23, 0.70];
  for (const side of [-1, 1]) {
    for (const wz of wheelZs) {
      verts = verts.concat(buildCylinderX(0.19, 0.40, [side*0.72, 0.16, wz], wheelColor, 12));
    }
  }
  verts = verts.concat(buildBox(1.3, 0.4, 1.8, [0, 0.42, 0], [0.82, 0.42, 0.10]));
  return new Float32Array(verts);
}
// Torre: gira em yaw por conta própria (mira no mouse), em cima do chassi
export function buildTurretDome() {
  return new Float32Array(buildBox(0.75, 0.4, 0.75, [0,0,0], [0.65, 0.32, 0.07]));
}
// Cano: geometria local com a base (encaixe) na origem, esticando para -Z. Elevação aplicada via matriz por quadro.
const BOX_BARREL_LENGTH = 1.28;
export function buildBarrel() {
  return new Float32Array(buildBox(0.156, 0.156, BOX_BARREL_LENGTH, [0, 0, -BOX_BARREL_LENGTH/2], [0.12, 0.12, 0.13]));
}
export const BOX_RIG = {
  turretPivot: [0, 0.82, 0.05],     // no chassi
  barrelMount: [0, 0.05, -0.30],    // na torre
  barrelLength: BOX_BARREL_LENGTH,  // do encaixe até a boca
};
export function buildBoxTank() {
  return { chassis: buildChassis(), turret: buildTurretDome(), barrel: buildBarrel(), rig: BOX_RIG };
}

// "Flash" do tiro: um pequeno cubo brilhante, escondido até atirar
export function buildMuzzleFlash() {
  return new Float32Array(buildBox(0.35, 0.35, 0.35, [0,0,0], [1,0.95,0.5]));
}

// ---------- Versão com o modelo 3D ----------
// O arquivo vem em "unidades Sketchfab" (~297 de comprimento), Y para cima
// depois da matriz do nó raiz, com o cano apontando para +Z. No jogo o
// tanque olha para -Z e tem ~2.2 de comprimento (as caixas tinham 2.0).
const MODEL_LENGTH = 2.2;
const MODEL_SCALE = MODEL_LENGTH / 297.5;
const MODEL_LIFT = 7.65 * MODEL_SCALE;   // base das esteiras (y = -7.65) no chão
// Regiões medidas nos componentes conexos da malha (coordenadas da cena glTF):
//   cano: cilindro fino x ±11, altura 159..181, de Z = 54 a 97 (à frente da torre)
//   torre: tudo acima de 140; esteiras/rodas: |x| > 50
const BARREL_REGION = { maxAbsX: 12, minY: 150, minZ: 50 };
const TURRET_MIN_Y = 140;
const TRACKS_MIN_ABS_X = 50;
// Pivô de elevação do cano (centro do mantelete) e boca, na cena glTF
const MODEL_BARREL_PIVOT = [0, 170, 40];
const MODEL_MUZZLE_Z = 97;

// cena glTF -> espaço do tanque no jogo: escala, gira 180° em Y (cano para -Z), apoia no chão
const toGame = p => [-p[0] * MODEL_SCALE, p[1] * MODEL_SCALE + MODEL_LIFT, -p[2] * MODEL_SCALE];
const normalToGame = n => [-n[0], n[1], -n[2]];

// Agrupa vértices em peças (componentes conexos por triângulo, soldando
// vértices na mesma posição, que o arquivo duplica nas costuras de UV).
function connectedComponents(prim) {
  const n = prim.positions.length / 3;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const idx = prim.indices;
  for (let t = 0; t < idx.length; t += 3) { union(idx[t], idx[t+1]); union(idx[t+1], idx[t+2]); }
  const byPos = new Map();
  for (let i = 0; i < n; i++) {
    const p = prim.positions;
    const key = `${p[i*3].toFixed(2)},${p[i*3+1].toFixed(2)},${p[i*3+2].toFixed(2)}`;
    if (byPos.has(key)) union(i, byPos.get(key)); else byPos.set(key, i);
  }
  const bbox = new Map(); // raiz -> [minX,minY,minZ,maxX,maxY,maxZ]
  for (let i = 0; i < n; i++) {
    const r = find(i), p = prim.positions;
    const b = bbox.get(r) || [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[i*3+k]); b[k+3] = Math.max(b[k+3], p[i*3+k]); }
    bbox.set(r, b);
  }
  return { find, bbox };
}

function classify(b) {
  const inBarrel = Math.max(Math.abs(b[0]), Math.abs(b[3])) <= BARREL_REGION.maxAbsX
    && b[1] >= BARREL_REGION.minY && b[2] >= BARREL_REGION.minZ;
  if (inBarrel) return "barrel";
  const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2;
  if (cy > TURRET_MIN_Y) return "turret";
  if (Math.abs(cx) > TRACKS_MIN_ABS_X) return "detail";
  return "hull";
}

// Monta as malhas do jogo a partir do glTF: corpo (casco + detalhes, no
// referencial do chassi), torre (relativa ao centro dela, gira em yaw) e cano
// (relativo ao pivô, gira com a elevação, preso à torre).
export function buildModelTank(gltf) {
  const body = [], turretTris = [], barrel = [];
  const pivot = toGame(MODEL_BARREL_PIVOT);
  const stats = { hull: 0, turret: 0, detail: 0, barrel: 0 };
  for (const prim of gltf.primitives) {
    const { find, bbox } = connectedComponents(prim);
    const P = prim.positions, N = prim.normals, idx = prim.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const part = classify(bbox.get(find(idx[t])));
      stats[part]++;
      const color = part === "hull" || part === "turret" ? TANK_BODY_COLOR : TANK_DETAIL_COLOR;
      const out = part === "barrel" ? barrel : part === "turret" ? turretTris : body;
      const tri = [idx[t], idx[t+1], idx[t+2]];
      let flat = null;
      if (!N) { // sem normais no arquivo: normal da face
        const [a, b, c] = tri.map(i => [P[i*3], P[i*3+1], P[i*3+2]]);
        const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
        const nx = u[1]*v[2]-u[2]*v[1], ny = u[2]*v[0]-u[0]*v[2], nz = u[0]*v[1]-u[1]*v[0];
        const l = Math.hypot(nx, ny, nz) || 1; flat = [nx/l, ny/l, nz/l];
      }
      for (const i of tri) {
        let p = toGame([P[i*3], P[i*3+1], P[i*3+2]]);
        if (part === "barrel") p = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
        const n = normalToGame(flat || [N[i*3], N[i*3+1], N[i*3+2]]);
        out.push(p[0], p[1], p[2], n[0], n[1], n[2], color[0], color[1], color[2]);
      }
    }
  }
  if (stats.barrel === 0) throw new Error("Cano não encontrado no modelo (regiões de classificação não batem)");
  // eixo de giro da torre: centro (x, z) da caixa que envolve os triângulos dela
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < turretTris.length; i += 9) {
    x0 = Math.min(x0, turretTris[i]); x1 = Math.max(x1, turretTris[i]);
    z0 = Math.min(z0, turretTris[i + 2]); z1 = Math.max(z1, turretTris[i + 2]);
  }
  const tp = turretTris.length ? [(x0 + x1) / 2, 0, (z0 + z1) / 2] : [0, 0, 0];
  for (let i = 0; i < turretTris.length; i += 9) { turretTris[i] -= tp[0]; turretTris[i + 2] -= tp[2]; }
  return {
    chassis: new Float32Array(body),
    turret: new Float32Array(turretTris),
    barrel: new Float32Array(barrel),
    rig: {
      turretPivot: tp,                                         // no chassi
      barrelMount: [pivot[0] - tp[0], pivot[1], pivot[2] - tp[2]],   // na torre
      barrelLength: (MODEL_MUZZLE_Z - MODEL_BARREL_PIVOT[2]) * MODEL_SCALE,
    },
    stats,
  };
}

// ---------- Rig ativo + matrizes ----------
let rig = BOX_RIG;
export function setTankRig(r) { rig = r; }
export function barrelLength() { return rig.barrelLength; }

// Matrizes de modelo chassi -> torre -> cano para o estado atual (posição,
// yaw do corpo, yaw da torre no mundo, pitch). Usada no desenho de cada quadro,
// no disparo e na linha de mira. Sem turretYaw (tanques inimigos), a torre
// olha para a frente do corpo.
export function tankModelMatrices(state) {
  const chassis = mat4.multiply(
    mat4.translation(state.x, 0, state.z),
    mat4.rotationY(state.yaw)
  );
  const turretRel = (state.turretYaw ?? state.yaw) - state.yaw;
  const turret = mat4.multiply(chassis,
    mat4.multiply(mat4.translation(...rig.turretPivot), mat4.rotationY(turretRel)));
  const barrel = mat4.multiply(
    turret,
    mat4.multiply(mat4.translation(...rig.barrelMount), mat4.rotationX(state.aimPitch))
  );
  return { chassis, turret, barrel };
}

