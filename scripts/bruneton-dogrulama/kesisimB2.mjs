// FAZ B2 ORACLE: disk düzlemi kesişimlerinin KONUMU ve ışının oradaki YÖNÜ
// tablolardan analitik olarak çıkarılabiliyor mu?
//   psi_k = alpha + k*pi  (psi_k < psi_max olanlar gerçekleşir)
//   phi   = phi_c + psi_k,  phi_c = 2*Delta_apsis - Delta_kalan + pi - delta
//   r     = 1/U(e2, phi)
//   u_dot = ±sqrt(e2 + u^3 - u^2), işaret: phi < phi_apsis ise + (içe), sonra -
//   yön   = normalize((-u_dot/u)*er + et)
import { buildDeflectionTableAdaptive, buildInverseRadiusTable, tableDeflection,
         sample2, texCoord, phiUb, KMU, IW, IH } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const {data:D}=buildDeflectionTableAdaptive(1.0); const U=buildInverseRadiusTable();
const invRad=(e2,phi)=>sample2(U,IW,IH,texCoord(1/(1+6*e2),IW),texCoord(clamp(phi/phiUb(e2),0,1),IH))[0];
const deflTexU=(e2)=>e2<KMU?0.5-Math.sqrt(-Math.log(1-e2/KMU)/50):0.5+Math.sqrt(-Math.log(1-KMU/e2)/50);
const apsisOf=(e2)=>sample2(D,512,512,texCoord(deflTexU(e2),512),texCoord(1,512))[0];
const DISK_IN=2.32, R_OUT=13.5, rA=DISK_IN-1.5, rB=R_OUT+0.5;
const KMAX=4;

function analytic(p,v){
  const r0=len(p), pr=norm(p);
  let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) return null;
  ez=mul(ez,1/ezl);
  const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  const dRem=tableDeflection(D,u,ud,e2); if(dRem<0) return {captured:true};
  const dA=apsisOf(e2);
  const phiC=2*dA-dRem+Math.PI-delta, phiA=dA+Math.PI/2, pub=phiUb(e2);
  const psiMax=delta+dRem;
  let td=cross([0,1,0],ez); const tdl=len(td); if(tdl<=1e-5) return {hits:[]};
  td=mul(td,1/tdl); if(dot(td,ey)<0) td=mul(td,-1);
  const alpha=Math.acos(clamp(dot(pr,td),-1,1));
  const hits=[];
  for(let k=0;k<KMAX;k++){
    const psi=alpha+k*Math.PI;
    if(psi>=psiMax) break;
    const phi=phiC+psi;
    // APSİS SİMETRİSİ: u(phi) apsis etrafında simetriktir, r(phi)=r(2*phiA-phi).
    // Dışa giden bacağı içe giden bacağa yansıtmak phi_ub kapsam sorununu
    // tümüyle kaldırır (kameramız disk kenarında olduğu için phi_c zaten
    // phi_ub'ye yakın; yansıtmasız kesişimlerin %20'si düşüyordu).
    const phiEff = phi<=phiA ? phi : 2*phiA-phi;
    if(phiEff<0) continue;                      // ışın çoktan sonsuza kaçtı
    if(phiEff>pub) continue;
    const uu=Math.max(invRad(e2,phiEff),1e-9), rr=1/uu;
    const er=add(mul(pr,Math.cos(psi)), mul(ey,Math.sin(psi)));
    const et=add(mul(pr,-Math.sin(psi)), mul(ey,Math.cos(psi)));
    const sgn = phi<phiA ? 1 : -1;
    const udl = sgn*Math.sqrt(Math.max(e2+uu*uu*uu-uu*uu,0));
    const dir = norm(add(mul(er,-udl/uu), et));
    hits.push({r:rr, pos:mul(er,rr), dir, psi, phi});
  }
  return {hits, psiMax, alpha};
}
function truth(p0,v0){
  let p=[...p0],v=[...v0]; const h2=dot(cross(p,v),cross(p,v)); const dt=0.0015; const hits=[];
  for(let i=0;i<900000;i++){
    const r2=dot(p,p),r=Math.sqrt(r2);
    if(r<1) return {hits,captured:true};
    if(r>60&&dot(p,v)>0) return {hits,captured:false};
    const c=-1.5*h2/(r2*r2*r); const pp=[...p], pv=[...v];
    v=[v[0]+c*p[0]*dt,v[1]+c*p[1]*dt,v[2]+c*p[2]*dt];
    p=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt];
    if(pp[1]*p[1]<0){const t=pp[1]/(pp[1]-p[1]);
      const hp=[pp[0]+(p[0]-pp[0])*t, 0, pp[2]+(p[2]-pp[2])*t];
      hits.push({r:Math.hypot(hp[0],hp[2]), pos:hp, dir:norm(pv)});}
  }
  return {hits,captured:false};
}
const camPos=[2.2,1.15,13.2];
const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
const aspect=1512/747, tanF=Math.tan(55*Math.PI/360);
let eslesen=0, kacan=0, fazla=0; const rErr=[], dErr=[], posErr=[]; const bandDagilim={};
for(let py=0;py<48;py++) for(let px=0;px<96;px++){
  const sx=(px+0.5)/96*2-1, sy=1-(py+0.5)/48*2;
  const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                 fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                 fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
  const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
  const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
  const a=analytic(camPos,v); if(!a||a.captured) continue;
  const t=truth(camPos,v); if(t.captured) continue;
  const tb=t.hits.filter(h=>h.r>rA&&h.r<rB);
  const ab=a.hits.filter(h=>h.r>rA&&h.r<rB);
  bandDagilim[tb.length]=(bandDagilim[tb.length]||0)+1;
  // İNDEKSE GÖRE DEĞİL KONUMA GÖRE eşleştir: bir kesişim eksikse indeks
  // eşleştirmesi sonrakileri kaydırıp alakasız çiftler üretiyor (sahte outlier).
  const kullanildi=new Array(ab.length).fill(false);
  for(const th of tb){
    let en=-1, enD=1e9;
    for(let j=0;j<ab.length;j++){
      if(kullanildi[j]) continue;
      const d=len([ab[j].pos[0]-th.pos[0],0,ab[j].pos[2]-th.pos[2]]);
      if(d<enD){ enD=d; en=j; }
    }
    if(en<0 || enD>1.0){ kacan++; continue; }
    kullanildi[en]=true; eslesen++;
    rErr.push(Math.abs(ab[en].r-th.r)/th.r);
    posErr.push(enD);
    dErr.push(Math.acos(clamp(dot(ab[en].dir,th.dir),-1,1)));
  }
  fazla += kullanildi.filter(x=>!x).length;
}
const st=a=>{a.sort((x,y)=>x-y);return a.length?{med:a[a.length>>1],p95:a[Math.floor(a.length*0.95)],max:a[a.length-1]}:null;};
const q=(a,f)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length*f)];};
const d99=q(dErr,0.99), r99=q(rErr,0.99);
const R=st(rErr), P=st(posErr), Dd=st(dErr);
console.log(`bant içi kesişim: eşleşen ${eslesen}, ANALİTİKTE EKSİK ${kacan}, ANALİTİKTE FAZLA ${fazla}`);
console.log(`gerçek bant kesişim sayısı dağılımı: ${JSON.stringify(bandDagilim)}`);
console.log(`yarıçap bağıl hata : medyan ${(R.med*100).toFixed(3)}%  p95 ${(R.p95*100).toFixed(2)}%  p99 ${(r99*100).toFixed(2)}%  max ${(R.max*100).toFixed(2)}%`);
console.log(`konum hatası (birim): medyan ${P.med.toFixed(4)}  p95 ${P.p95.toFixed(3)}  max ${P.max.toFixed(3)}`);
console.log(`YÖN hatası          : medyan ${(Dd.med*1e3).toFixed(3)} mrad  p95 ${(Dd.p95*1e3).toFixed(2)}  p99 ${(d99*1e3).toFixed(2)}  max ${(Dd.max*1e3).toFixed(2)} mrad`);
