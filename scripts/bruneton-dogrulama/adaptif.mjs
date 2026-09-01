import { buildDeflectionTable, buildDeflectionTableAdaptive, tableDeflection, refEscapeAngle } from './bruneton.mjs';
function errStats(D) {
  const errs = [];
  for (const rCam of [8, 13.2, 25, 40]) {
    for (let n = 1; n <= 120; n++) {
      const delta = Math.PI * (1 - n / 121);
      const u = 1 / rCam, ud = -u / Math.tan(delta);
      const e2 = ud*ud + u*u*(1-u);
      const refPhi = refEscapeAngle(u, ud);
      const defl = tableDeflection(D, u, ud, e2);
      if (refPhi === null || defl < 0) continue;
      errs.push(Math.abs((delta + Math.max(defl,0)) - refPhi));
    }
  }
  errs.sort((a,b)=>a-b);
  return { n: errs.length, med: errs[Math.floor(errs.length/2)], p99: errs[Math.floor(errs.length*0.99)], max: errs[errs.length-1] };
}
let t = Date.now(); const Dref = buildDeflectionTable(); const tRef = Date.now()-t;
const s0 = errStats(Dref);
console.log(`Euler dφ=1e-5 (referans):    ${String(tRef).padStart(5)} ms — medyan ${(s0.med*1e3).toFixed(4)}  p99 ${(s0.p99*1e3).toFixed(3)}  max ${(s0.max*1e3).toFixed(3)} mrad`);
for (const mr of [1.0, 0.5, 0.25, 0.1]) {
  t = Date.now(); const { data, steps } = buildDeflectionTableAdaptive(mr); const ms = Date.now()-t;
  const s = errStats(data);
  console.log(`Uyarlanabilir RK4 ${String(mr).padEnd(4)} satır: ${String(ms).padStart(5)} ms — medyan ${(s.med*1e3).toFixed(4)}  p99 ${(s.p99*1e3).toFixed(3)}  max ${(s.max*1e3).toFixed(3)} mrad  (${(steps/1e6).toFixed(2)}M adım)`);
}
