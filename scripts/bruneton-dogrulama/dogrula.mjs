// (1) Referans entegratörünü ANALİTİK sonuçla sına: zayıf alanda sonsuzdan
//     sonsuza toplam sapma Δ → 2/b (r_s=1 birimlerinde 2GM/c²b·2 = 2r_s/b).
// (2) Tablo kurma süresi.
import { buildDeflectionTable, buildInverseRadiusTable, KMU } from './bruneton.mjs';

function totalDeflectionFromInfinity(b, h = 1e-4) {
  // u=0, u̇=e=1/b'den başla; apsis'i geç, u tekrar 0'a dönene kadar entegre et
  let u = 0, ud = 1 / b, phi = 0;
  const f = (u, ud) => [ud, 1.5 * u * u - u];
  let first = true;
  while (phi < 400) {
    if (u >= 1) return null;
    const [a1, b1] = f(u, ud);
    const [a2, b2] = f(u + h/2*a1, ud + h/2*b1);
    const [a3, b3] = f(u + h/2*a2, ud + h/2*b2);
    const [a4, b4] = f(u + h*a3, ud + h*b3);
    const nu = u + h/6*(a1 + 2*a2 + 2*a3 + a4);
    const nd = ud + h/6*(b1 + 2*b2 + 2*b3 + b4);
    if (!first && nu <= 0) return phi + h*(u/(u-nu)) - Math.PI;  // Δ = φ_toplam − π
    first = false;
    u = nu; ud = nd; phi += h;
  }
  return null;
}

console.log('Referans entegratörü, zayıf alan sınaması (Δ → 2/b):');
for (const b of [200, 100, 50, 20, 10]) {
  const d = totalDeflectionFromInfinity(b);
  const analytic = 2 / b;                       // birinci mertebe
  const second = 2/b + 15*Math.PI/(16*b*b);     // ikinci mertebe (r_s=1)
  console.log(`  b=${String(b).padStart(4)}: sayısal ${d.toFixed(8)}  1.mertebe ${analytic.toFixed(8)} (fark ${((d-analytic)*1e6).toFixed(1)} µrad)  2.mertebe ${second.toFixed(8)} (fark ${((d-second)*1e6).toFixed(2)} µrad)`);
}
const bc = Math.sqrt(27)/2;
console.log(`\nKritik etki parametresi sınaması (b_krit = ${bc.toFixed(6)}):`);
for (const f of [1.2, 1.05, 1.01, 1.001]) {
  const d = totalDeflectionFromInfinity(bc*f);
  console.log(`  b=${(bc*f).toFixed(5)} (${f}×b_krit): Δ = ${d === null ? 'YAKALANDI' : d.toFixed(4) + ' rad = ' + (d*180/Math.PI).toFixed(1) + '°'}`);
}
console.log(`  b=${(bc*0.999).toFixed(5)} (0.999×b_krit): ${totalDeflectionFromInfinity(bc*0.999) === null ? 'YAKALANDI ✓' : 'KAÇTI (HATA)'}`);

let t = Date.now(); const D = buildDeflectionTable();
console.log(`\nD(e,u) 512×512 kurulumu: ${((Date.now()-t)/1000).toFixed(1)} sn`);
t = Date.now(); const U = buildInverseRadiusTable();
console.log(`U(e,φ) 64×32 kurulumu:  ${((Date.now()-t)/1000).toFixed(2)} sn`);
console.log(`Bellek: D ${(D.byteLength/1024/1024).toFixed(1)} MB (RG32F), U ${(U.byteLength/1024).toFixed(1)} KB`);
