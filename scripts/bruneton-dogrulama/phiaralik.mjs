// TEŞHİS: 𝕌 tablosunun φ ekseni bize yetiyor mu?
// Bruneton'un phi_ub = (1+e²)/(1/3 + 2e²√e²) formülü apsisi OLMAYAN ışınlarda
// (e² ≥ KMU, yani yakalananlar) ufka varmadan kesiliyor. Burada ölçülen:
//   (a) gerçek bitiş açısı φ_end(e²) — apsis (e²<KMU) ya da ufuk (e²≥KMU) —
//       ile phi_ub'nin oranı;
//   (b) gerçek kamera kadrajlarında YAKALANAN piksellerin oranı (kazanılacak
//       marş payı) ve o piksellerin istediği φ'nin phi_ub'ye oranı.
import { KMU, phiUb, uApsis } from './bruneton.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a));
const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};

// φ_end: u=0, ud=+e'den başlayıp apsise (ud=0) ya da ufka (u=1) varana kadarki
// açı. Uyarlanabilir RK4 + son adım rafinesi (lensTables'ın kendi reçetesi).
function phiEnd(e2, hMax=1e-2){
  const e=Math.sqrt(e2); const uEnd = e2<KMU ? uApsis(e2) : 1;
  let u=0, ud=e, phi=0, h=1e-4;
  const f=(u,ud)=>[ud, 1.5*u*u-u];
  for(let n=0;n<4e7;n++){
    if(u>=uEnd*(1-1e-12) || ud<0) return phi;
    const [a1,b1]=f(u,ud);
    const [a2,b2]=f(u+h/2*a1, ud+h/2*b1);
    const [a3,b3]=f(u+h/2*a2, ud+h/2*b2);
    const [a4,b4]=f(u+h*a3, ud+h*b3);
    const nu=u+h/6*(a1+2*a2+2*a3+a4), nd=ud+h/6*(b1+2*b2+2*b3+b4);
    if(nu>=uEnd || nd<0){ if(h>1e-9){h*=0.5;continue;} return phi+h; }
    u=nu; ud=nd; phi+=h; h=Math.min(h*1.3, hMax);
  }
  return phi;
}

console.log('=== (a) φ_end(e²) vs phi_ub(e²) ===');
console.log('e²           bölge      φ_ub      φ_end     φ_end/φ_ub');
for(const e2 of [0.001,0.01,0.05,0.10,0.140,0.1470,0.14812,
                 0.14818,0.1485,0.150,0.16,0.20,0.30,0.5,1.0,2.0,5.0,20.0]){
  const pu=phiUb(e2), pe=phiEnd(e2);
  const bolge = e2<KMU ? 'apsis' : 'ufuk ';
  console.log(`${e2.toFixed(5).padStart(8)}  ${bolge}  ${pu.toFixed(4).padStart(9)} ${pe.toFixed(4).padStart(9)}  ${(pe/pu).toFixed(3).padStart(8)}`);
}

// ---- (b) gerçek kadraj taraması ----
const R_OUT=13.5, uDiskIn=2.32;
// gerçek marş: yakalanan ışının disk düzlemi kesişimleri
function truth(p0,v0){
  let p=[...p0],v=[...v0]; const L=cross(p,v); const h2=dot(L,L); const dt=0.0015;
  const hits=[];
  for(let i=0;i<400000;i++){
    const r2=dot(p,p), r=Math.sqrt(r2);
    if(r<1) return {hits,captured:true};
    if(r>60&&dot(p,v)>0) return {hits,captured:false};
    const c=-1.5*h2/(r2*r2*r); const pp=[...p];
    v=[v[0]+c*p[0]*dt, v[1]+c*p[1]*dt, v[2]+c*p[2]*dt];
    p=[p[0]+v[0]*dt, p[1]+v[1]*dt, p[2]+v[2]*dt];
    if(pp[1]*p[1]<0){ const t=pp[1]/(pp[1]-p[1]);
      hits.push({r:Math.hypot(pp[0]+(p[0]-pp[0])*t, pp[2]+(p[2]-pp[2])*t)}); }
  }
  return {hits,captured:false};
}

let toplam=0, yakalanan=0, yakDiskli=0;
const oranlar=[];            // yakalanan pikselin istediği max φ / φ_ub
const oranlarEnd=[];         // ... / φ_end
let bantKesisim=0, bantKapsamDisi=0;
for(const camPos of [[2.2,1.15,13.2],[1.5,0.8,8.5],[4,3,20],[0.5,2.0,6.5]]){
  const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
  const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
  const aspect=1512/747, tanF=Math.tan(55*Math.PI/360);
  for(let py=0;py<48;py++) for(let px=0;px<96;px++){
    const sx=(px+0.5)/96*2-1, sy=1-(py+0.5)/48*2;
    const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                   fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                   fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
    const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
    const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1],
                  rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
    toplam++;
    let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) continue;
    ez=[ez[0]/ezl,ez[1]/ezl,ez[2]/ezl];
    const ey=cross(ez,pr);
    const delta=Math.acos(clamp(dot(pr,v),-1,1));
    const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
    const t=truth(camPos,v);
    if(!t.captured) continue;
    yakalanan++;
    const bant=t.hits.filter(h=>h.r>uDiskIn-1.5 && h.r<R_OUT);
    if(!bant.length) continue;
    yakDiskli++;
    // φ_c = sonsuzdan kameraya süpürülen açı (yakalanan ışında apsis yok,
    // yani içe giden bacak boyunca doğrudan). Shader'daki dAcc + π − δ ile
    // aynı büyüklük. Işın buradan φ_end'e kadar devam eder.
    const phiCam = phiFromU(e2, u);
    let td=cross([0,1,0],ez); const tdl=len(td); if(tdl<=1e-5) continue;
    td=[td[0]/tdl,td[1]/tdl,td[2]/tdl];
    if(dot(td,ey)<0) td=[-td[0],-td[1],-td[2]];
    const alpha=Math.acos(clamp(dot(pr,td),-1,1));
    const psiMax=phiEnd(e2)-phiCam;
    let maxPhi=0;
    for(let k=0;k<6;k++){ const psi=alpha+k*Math.PI; if(psi>=psiMax) break;
      maxPhi=Math.max(maxPhi, phiCam+psi); bantKesisim++;
      if(phiCam+psi > phiUb(e2)) bantKapsamDisi++; }
    if(maxPhi>0){ oranlar.push(maxPhi/phiUb(e2)); oranlarEnd.push(maxPhi/phiEnd(e2)); }
  }
}
// φ(u): sonsuzdan u'ya kadarki açı (yakalanan dal, ud>0 boyunca)
function phiFromU(e2, uT){
  const e=Math.sqrt(e2); let u=0, ud=e, phi=0, h=1e-4;
  const f=(u,ud)=>[ud,1.5*u*u-u];
  for(let n=0;n<4e7;n++){
    if(u>=uT) return phi;
    const [a1,b1]=f(u,ud); const [a2,b2]=f(u+h/2*a1,ud+h/2*b1);
    const [a3,b3]=f(u+h/2*a2,ud+h/2*b2); const [a4,b4]=f(u+h*a3,ud+h*b3);
    const nu=u+h/6*(a1+2*a2+2*a3+a4), nd=ud+h/6*(b1+2*b2+2*b3+b4);
    if(nu>=uT){ if(h>1e-9){h*=0.5;continue;} return phi+h; }
    if(nd<0) return phi;
    u=nu; ud=nd; phi+=h; h=Math.min(h*1.3,1e-2);
  }
  return phi;
}
const q=(a,f)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*f))];};
console.log('\n=== (b) 4 kamera x 4608 piksel ===');
console.log(`  toplam ${toplam}, YAKALANAN ${yakalanan} (%${(100*yakalanan/toplam).toFixed(1)}), bunlardan disk bandını kesen ${yakDiskli}`);
console.log(`  disk bandı kesişimi ${bantKesisim}, phi_ub KAPSAMI DIŞINDA ${bantKapsamDisi} (%${(100*bantKapsamDisi/Math.max(bantKesisim,1)).toFixed(1)})`);
console.log(`  istenen max φ / φ_ub  : medyan ${q(oranlar,.5).toFixed(2)}  p90 ${q(oranlar,.9).toFixed(2)}  MAX ${q(oranlar,1).toFixed(2)}`);
console.log(`  istenen max φ / φ_end : medyan ${q(oranlarEnd,.5).toFixed(3)}  p90 ${q(oranlarEnd,.9).toFixed(3)}  MAX ${q(oranlarEnd,1).toFixed(3)}`);
