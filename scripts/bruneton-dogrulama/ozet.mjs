import { buildDeflectionTableAdaptive, buildInverseRadiusTable, tableDeflection,
         refEscapeAngle, sample2, texCoord, invRadTexU, phiUb, IW, IH } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function shaderMarch(p0,v0,steps,uEsc){
  let p=[...p0],v=[...v0]; const L=cross(p,v); const h2=dot(L,L);
  const ss=150/steps, boost=1+0.6*smoothstep(120,289,h2);
  for(let i=0;i<260;i++){ if(i>=steps)break;
    const r2=dot(p,p), r=Math.sqrt(r2);
    if(r<1) return {captured:true};
    if(r>uEsc&&dot(p,v)>0) break;
    if(r2>240&&p[1]*v[1]>0&&dot(p,v)>0) break;
    const dt=(0.045+0.065*Math.max(r-1.6,0))*ss*boost, c=-1.5*h2/(r2*r2*r);
    v=[v[0]+c*p[0]*dt,v[1]+c*p[1]*dt,v[2]+c*p[2]*dt];
    p=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt]; }
  return {dir:norm(v),captured:false};
}
const t0=Date.now(); const {data:D}=buildDeflectionTableAdaptive(1.0); const U=buildInverseRadiusTable();
console.log(`Tablolar kuruldu: ${Date.now()-t0} ms  (D 512x512 RG32F = 2.0 MB, U 64x32 = 16 KB)\n`);

// --- 1) kaçış yönü: marş vs tablo, referansa göre ---
const errT=[],errM=[]; let capDiff=0,n=0;
for(const rCam of [6,8,13.2,20,30,44]){
  const uEsc=Math.max(44,rCam+8);
  for(let k=1;k<=200;k++){
    const delta=Math.PI*(1-k/201);
    const camP=[0,1.2,Math.sqrt(Math.max(rCam*rCam-1.44,0.01))];
    const ex=norm(camP), aux=norm(cross(ex,[0.31,1,0.07])), ey=norm(cross(aux,ex));
    const d=[Math.cos(delta)*ex[0]+Math.sin(delta)*ey[0],Math.cos(delta)*ex[1]+Math.sin(delta)*ey[1],Math.cos(delta)*ex[2]+Math.sin(delta)*ey[2]];
    const u=1/len(camP), ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
    const ref=refEscapeAngle(u,ud), defl=tableDeflection(D,u,ud,e2), m=shaderMarch(camP,d,240,uEsc);
    if(ref===null||defl<0){ if(!(ref===null&&defl<0&&m.captured)) capDiff++; continue; }
    if(m.captured){ capDiff++; continue; }
    n++;
    const dRef=[Math.cos(ref)*ex[0]+Math.sin(ref)*ey[0],Math.cos(ref)*ex[1]+Math.sin(ref)*ey[1],Math.cos(ref)*ex[2]+Math.sin(ref)*ey[2]];
    const dTab=[Math.cos(delta+defl)*ex[0]+Math.sin(delta+defl)*ey[0],Math.cos(delta+defl)*ex[1]+Math.sin(delta+defl)*ey[1],Math.cos(delta+defl)*ex[2]+Math.sin(delta+defl)*ey[2]];
    errT.push(Math.acos(clamp(dot(dTab,dRef),-1,1)));
    errM.push(Math.acos(clamp(dot(m.dir,dRef),-1,1)));
  }
}
const st=a=>{a=a.slice().sort((x,y)=>x-y);return{med:a[a.length>>1],p99:a[Math.floor(a.length*0.99)],max:a[a.length-1]};};
const T=st(errT), M=st(errM);
console.log(`KAÇIŞ YÖNÜ HATASI (${n} ışın, 6 kamera mesafesi, referans = RK4 dφ=1e-3)`);
console.log(`  tablo:  medyan ${(T.med*1e3).toFixed(4)} mrad   p99 ${(T.p99*1e3).toFixed(3)}   max ${(T.max*1e3).toFixed(3)} mrad`);
console.log(`  marş:   medyan ${(M.med*1e3).toFixed(4)} mrad   p99 ${(M.p99*1e3).toFixed(3)}   max ${(M.max*1e3).toFixed(3)} mrad`);
console.log(`  → tablo, mevcut 240 adımlık marştan ${(M.med/T.med).toFixed(0)}× (medyan) / ${(M.max/T.max).toFixed(0)}× (max) daha doğru`);
console.log(`  yakalama kararı uyuşmazlığı: ${capDiff} ışın (kritik b sınırındaki jilet kenarı)\n`);

// --- 2) U(e,φ) tablosu: ışın üstündeki yarıçap (disk kesişimi için) ---
function refU(e2, phiT){
  let u=0,ud=Math.sqrt(e2),phi=0; const h=1e-4;
  const f=(u,ud)=>[ud,1.5*u*u-u];
  while(phi<phiT){ const hh=Math.min(h,phiT-phi);
    const [a1,b1]=f(u,ud),[a2,b2]=f(u+hh/2*a1,ud+hh/2*b1),[a3,b3]=f(u+hh/2*a2,ud+hh/2*b2),[a4,b4]=f(u+hh*a3,ud+hh*b3);
    u+=hh/6*(a1+2*a2+2*a3+a4); ud+=hh/6*(b1+2*b2+2*b3+b4); phi+=hh; if(u>=1)return null; }
  return u;
}
const eu=[];
for(let i=1;i<40;i++){
  const e2=(i/40)*0.5;
  const pub=phiUb(e2);
  for(let k=1;k<20;k++){
    const phi=pub*(k/20);
    const ru=refU(e2,phi); if(ru===null)continue;
    const tu=texCoord(invRadTexU(e2),IW), tv=texCoord(phi/pub,IH);
    const got=sample2(U,IW,IH,tu,tv)[0];
    if(ru>1e-3) eu.push(Math.abs(got-ru)/ru);
  }
}
const E=st(eu);
console.log(`U(e,φ) TABLOSU — ışın yarıçapı (disk kesişimi), bağıl hata (${eu.length} nokta)`);
console.log(`  medyan ${(E.med*100).toFixed(3)}%   p99 ${(E.p99*100).toFixed(2)}%   max ${(E.max*100).toFixed(2)}%`);
