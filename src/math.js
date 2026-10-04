// ---------- Álgebra de matrizes mínima ----------
// Matrizes 4x4 em Float32Array, column-major (mesmo layout esperado pelo WGSL).
export const mat4 = {
  identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  multiply(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + j] * b[i * 4 + k];
        out[i * 4 + j] = sum;
      }
    }
    return out;
  },
  perspective(fovYRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovYRad / 2);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf;
    out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  },
  lookAt(eye, target, up) {
    const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
    const norm = v => { const l = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const zAxis = norm(sub(eye, target));
    const xAxis = norm(cross(up, zAxis));
    const yAxis = cross(zAxis, xAxis);
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
    ]);
  },
  rotationY(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
  },
  rotationX(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
  },
  // Ortográfica no padrão do WebGPU (profundidade 0..1), olhando para -Z; usada na
  // "câmera" do sol para o mapa de sombras
  ortho(l, r, b, t, n, f) {
    return new Float32Array([
      2/(r-l), 0, 0, 0,
      0, 2/(t-b), 0, 0,
      0, 0, 1/(n-f), 0,
      -(r+l)/(r-l), -(t+b)/(t-b), n/(n-f), 1,
    ]);
  },
  translation(tx, ty, tz) {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]);
  },
};

function transformVec4(m, v) {
  const [x,y,z,w] = v;
  return [
    m[0]*x+m[4]*y+m[8]*z+m[12]*w,
    m[1]*x+m[5]*y+m[9]*z+m[13]*w,
    m[2]*x+m[6]*y+m[10]*z+m[14]*w,
  ];
}
export function transformPoint(m, v) { return transformVec4(m, [v[0], v[1], v[2], 1]); }
export function transformDirection(m, v) { return transformVec4(m, [v[0], v[1], v[2], 0]); }
