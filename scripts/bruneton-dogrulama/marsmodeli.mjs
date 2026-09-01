// Marşın hatası ayrıştırılıyor: adım sayısı mı, formülasyon mu?
import { refEscapeAngle } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
// Kartezyen ODE'yi SABİT küçük adımla, erken çıkış YOK, r=1000'e kadar
function cartesian(p0,v0,dt,rEnd=2000){
  let p=[...p0],v=[...v0]; const h2=dot(cross(p,v),cross(p,v));
  for(let i=0;i<8e6;i++){
    const r2=dot(p,p), r=Math.sqrt(r2);
    if(r<1) return null;
    if(r>rEnd&&dot(p,v)>0) return norm(v);
    const c=-1.5*h2/(r2*r2*r);
    v=[v[0]+c*p[0]*dt,v[1]+c*p[1]*dt,v[2]+c*p[2]*dt];
    p=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt];
  }
  return norm(v);
}
const rCam=13.2;
console.log(`Kamera r=${rCam}. Kartezyen ODE, erken çıkış yok, sabit adım — referansa göre hata:\n`);
console.log('  delta   b      dt=0.02      dt=0.005     dt=0.001     (mrad)');
for(const delta of [2.9, 2.6, 2.2, 1.8, 1.2, 0.6]){
  const camP=[0,1.2,Math.sqrt(rCam*rCam-1.44)];
  const ex=norm(camP), aux=norm(cross(ex,[0.31,1,0.07])), ey=norm(cross(aux,ex));
  const d=[Math.cos(delta)*ex[0]+Math.sin(delta)*ey[0],Math.cos(delta)*ex[1]+Math.sin(delta)*ey[1],Math.cos(delta)*ex[2]+Math.sin(delta)*ey[2]];
  const u=1/rCam, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u), b=1/Math.sqrt(e2);
  const ref=refEscapeAngle(u,ud);
  if(ref===null){ console.log(`  ${delta.toFixed(2)}  ${b.toFixed(3)}  YAKALANDI`); continue; }
  const dRef=[Math.cos(ref)*ex[0]+Math.sin(ref)*ey[0],Math.cos(ref)*ex[1]+Math.sin(ref)*ey[1],Math.cos(ref)*ex[2]+Math.sin(ref)*ey[2]];
  const errs=[0.02,0.005,0.001].map(dt=>{
    const r=cartesian(camP,d,dt); return r===null?NaN:Math.acos(clamp(dot(r,dRef),-1,1))*1e3;
  });
  console.log(`  ${delta.toFixed(2)}  ${b.toFixed(3)}  ${errs.map(e=>e.toFixed(3).padStart(10)).join(' ')}`);
}
