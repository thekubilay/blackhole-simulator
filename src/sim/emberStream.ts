import * as THREE from 'three'

/**
 * Kor parçacık akımı: tek draw-call'luk özel point shader. Parçacık yaşlandıkça
 * akkor beyazdan kızıla soğur, küçülür ve söner — spagetti şeridi tek malzeme
 * ile çizilir, PointsMaterial'e göre ek maliyeti yoktur.
 */
export interface EmberStream {
  pts: THREE.Points
  posArr: Float32Array
  ageArr: Float32Array
  material: THREE.ShaderMaterial
}

const VERT = /* glsl */ `
attribute float aAge;
attribute float aSeed;
varying float vAge;
varying float vSeed;
uniform float uScaleH;
void main(){
  vAge = aAge; vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = 0.052 * (0.7 + 0.6*aSeed) * (1.0 - 0.45*aAge);
  gl_PointSize = size * uScaleH / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}`

const FRAG = /* glsl */ `
precision mediump float;
varying float vAge;
varying float vSeed;
uniform float uOpacity;
void main(){
  vec2 c = gl_PointCoord*2.0 - 1.0;
  float d2 = dot(c, c);
  if(d2 > 1.0) discard;
  float fall = exp(-d2*3.2);
  // sıcaklık: taze kor akkor beyaz-sarı → yaşlandıkça turuncu-kızıl (soğuma)
  vec3 hot = vec3(1.0, 0.93, 0.74);
  vec3 cool = vec3(1.0, 0.32, 0.10);
  vec3 col = mix(hot, cool, smoothstep(0.04, 0.75, vAge));
  float tw = 0.85 + 0.15*sin(vSeed*40.0 + vAge*22.0);
  float a = fall * (1.0 - vAge) * uOpacity * tw;
  gl_FragColor = vec4(col * a, a);
}`

export function createEmberStream(cap: number): EmberStream {
  const posArr = new Float32Array(cap * 3)
  posArr.fill(1e5)
  const ageArr = new Float32Array(cap)
  ageArr.fill(1)
  const seedArr = new Float32Array(cap)
  for (let i = 0; i < cap; i++) seedArr[i] = Math.random()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
  geo.setAttribute('aAge', new THREE.BufferAttribute(ageArr, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seedArr, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uScaleH: { value: 700 }, uOpacity: { value: 0.9 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, material)
  pts.frustumCulled = false
  return { pts, posArr, ageArr, material }
}
