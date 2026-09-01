// ÖZ-TEST v2: phi_c = 2*Delta_apsis - Delta_kalan + pi - delta
// Doğruysa U(e2, phi_c) tam olarak 1/r_kamera vermeli (yansıtma YOK:
// U tablosu apsisi geçiyor, doğrulandı).
import { buildDeflectionTableAdaptive, buildInverseRadiusTable, tableDeflection,
         sample2, texCoord, phiUb, KMU, IW, IH } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const {data:D}=buildDeflectionTableAdaptive(1.0); const U=buildInverseRadiusTable();
const invRad=(e2,phi)=>sample2(U,IW,IH,texCoord(1/(1+6*e2),IW),texCoord(clamp(phi/phiUb(e2),0,1),IH))[0];
const deflTexU=(e2)=>e2<KMU?0.5-Math.sqrt(-Math.log(1-e2/KMU)/50):0.5+Math.sqrt(-Math.log(1-KMU/e2)/50);
const apsisOf=(e2)=>sample2(D,512,512,texCoord(deflTexU(e2),512),texCoord(1,512))[0];
let worst=0, n=0;
console.log('r_kam delta    phi_c   phi_ub   U(phi_c)->r   hata%');
for(const rCam of [6,8,13.4,20,25,40]){
  for(let k=1;k<=24;k++){
    const delta=Math.PI*(1-k/25);
    const u=1/rCam, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
    const dRem=tableDeflection(D,u,ud,e2);
    if(dRem<0) continue;
    const dA=apsisOf(e2);
    const phiC=2*dA-dRem+Math.PI-delta;
    const pub=phiUb(e2);
    const got=phiC<=pub ? 1/Math.max(invRad(e2,phiC),1e-9) : NaN;
    const err=Math.abs(got-rCam)/rCam*100;
    if(!isNaN(err)){ n++; if(err>worst) worst=err; }
    if(rCam===13.4 && k%4===0)
      console.log(`${String(rCam).padEnd(5)} ${delta.toFixed(3)} ${phiC.toFixed(4).padStart(8)} ${pub.toFixed(4).padStart(8)} ${(isNaN(got)?NaN:got).toFixed(3).padStart(12)}   ${err.toFixed(3)}`);
  }
}
console.log(`\n${n} ışın: EN KÖTÜ bağıl hata ${worst.toFixed(3)}%`);
