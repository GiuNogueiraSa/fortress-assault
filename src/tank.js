// ---------- Tanque: geometria + hierarquia de transformações ----------
import { mat4 } from "./math.js";
import { buildBox, buildCylinderX } from "./geometry.js";

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
// Torre (gira em yaw junto com o chassi — sem rotação própria por enquanto)
export const TURRET_PIVOT_IN_CHASSIS = [0, 0.82, 0.05];
export function buildTurretDome() {
  return new Float32Array(buildBox(0.75, 0.4, 0.75, [0,0,0], [0.65, 0.32, 0.07]));
}
// Cano: geometria local com a base (encaixe) na origem, esticando para -Z. Elevação aplicada via matriz por quadro.
export const BARREL_LENGTH = 1.28; // 20% menor que os 1.6 anteriores
export const BARREL_MOUNT_IN_TURRET = [0, 0.05, -0.30];
export function buildBarrel() {
  return new Float32Array(buildBox(0.156, 0.156, BARREL_LENGTH, [0, 0, -BARREL_LENGTH/2], [0.12, 0.12, 0.13]));
}
// "Flash" do tiro: um pequeno cubo brilhante, escondido até atirar
export function buildMuzzleFlash() {
  return new Float32Array(buildBox(0.35, 0.35, 0.35, [0,0,0], [1,0.95,0.5]));
}

// Matrizes de modelo chassi -> torre -> cano para o estado atual (posição, yaw, pitch).
// Usada tanto no desenho de cada quadro quanto no cálculo da boca do cano ao atirar.
export function tankModelMatrices(state) {
  const chassis = mat4.multiply(
    mat4.translation(state.x, 0, state.z),
    mat4.rotationY(state.yaw)
  );
  const turret = mat4.multiply(
    chassis,
    mat4.translation(TURRET_PIVOT_IN_CHASSIS[0], TURRET_PIVOT_IN_CHASSIS[1], TURRET_PIVOT_IN_CHASSIS[2])
  );
  const barrel = mat4.multiply(
    turret,
    mat4.multiply(
      mat4.translation(BARREL_MOUNT_IN_TURRET[0], BARREL_MOUNT_IN_TURRET[1], BARREL_MOUNT_IN_TURRET[2]),
      mat4.rotationX(state.aimPitch)
    )
  );
  return { chassis, turret, barrel };
}
