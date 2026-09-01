// 32 eksik kesişimin sebebi ne? Adaylar: KMAX kırpması, phiEff<0 (ışın kaçtı),
// psi>=psiMax kırpması, bant kenarı (analitik r bandın az dışına düşüyor).
import { buildDeflectionTableAdaptive, buildInverseRadiusTable, tableDeflection,
         sample2, texCoord, phiUb, KMU, IW, IH } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]; const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const {data:D}=buildDeflectionTableAdaptive(1.0); const U=buildInverseRadiusTable();
const invRad=(e2,phi)=>sample2(U,IW,IH,texCoord(1/(1+6*e2),IW),texCoord(clamp(phi/phiUb(e2),0,1),IH))[0];
const deflTexU=(e2)=>e2<KMU?0.5-Math.sqrt(-Math.log(1-e2/KMU)/50):0.5+Math.sqrt(-Math.log(1-KMU/e2)/50);
const apsisOf=(e2)=>sample2(D,512,512,texCoord(deflTexU(e2),512),texCoord(1,512))[0];
const DISK_IN=2.32, R_OUT=13.5, rA=DISK_IN-1.5, rB=R_OUT+0.5;
const KMAX=8;
function analytic(p,v){
  const r0=len(p), pr=norm(p);
  let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) return null;
  ez=mul(ez,1/ezl); const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  const dRem=tableDeflection(D,u,ud,e2); if(dRem<0) return {captured:true};
  const dA=apsisOf(e2), phiC=2*dA-dRem+Math.PI-delta, phiA=dA+Math.PI/2, pub=phiUb(e2);
  const psiMax=delta+dRem;
  let td=cross([0,1,0],ez); const tdl=len(td); if(tdl<=1e-5) return {hits:[],sebep:{}};
  td=mul(td,1/tdl); if(dot(td,ey)<0) td=mul(td,-1);
  const alpha=Math.acos(clamp(dot(pr,td),-1,1));
  const hits=[]; const sebep={psiMax:0,phiNeg:0,pub:0,kmax:0};
  for(let k=0;k<KMAX;k++){
    const psi=alpha+k*Math.PI;
    if(psi>=psiMax){ sebep.psiMax++; break; }
    const phi=phiC+psi;
    const phiEff=phi<=phiA?phi:2*phiA-phi;
    if(phiEff<0){ sebep.phiNeg++; continue; }
    if(phiEff>pub){ sebep.pub++; continue; }
    const uu=Math.max(invRad(e2,phiEff),1e-9), rr=1/uu;
    const er=add(mul(pr,Math.cos(psi)), mul(ey,Math.sin(psi)));
    hits.push({r:rr,pos:mul(er,rr),psi,k});
  }
  return {hits,sebep,psiMax,alpha,phiC,phiA,pub,e2};
}
function truth(p0,v0){
  let p=[...p0],v=[...v0]; const h2=dot(cross(p,v),cross(p,v)); const dt=0.0015; const hits=[];
  for(let i=0;i<900000;i++){
    const r2=dot(p,p),r=Math.sqrt(r2);
    if(r<1) return {hits,captured:true};
    if(r>60&&dot(p,v)>0) return {hits,captured:false};
    const c=-1.5*h2/(r2*r2*r); const pp=[...p];
    v=[v[0]+c*p[0]*dt,v[1]+c*p[1]*dt,v[2]+c*p[2]*dt];
    p=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt];
    if(pp[1]*p[1]<0){const t=pp[1]/(pp[1]-p[1]);
      const hp=[pp[0]+(p[0]-pp[0])*t,0,pp[2]+(p[2]-pp[2])*t];
      hits.push({r:Math.hypot(hp[0],hp[2]),pos:hp});}
  }
  return {hits,captured:false};
}
const camPos=[2.2,1.15,13.2];
const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
const aspect=1512/747, tanF=Math.tan(55*Math.PI/360);
let eksik=0, eslesen=0; const sebepler={bantKenari:0,hicYok:0}; const ornek=[];
const toplamSebep={psiMax:0,phiNeg:0,pub:0,kmax:0};
for(let py=0;py<48;py++) for(let px=0;px<96;px++){
  const sx=(px+0.5)/96*2-1, sy=1-(py+0.5)/48*2;
  const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                 fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                 fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
  const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
  const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
  const a=analytic(camPos,v); if(!a||a.captured) continue;
  const t=truth(camPos,v); if(t.captured) continue;
  for(const kk of Object.keys(toplamSebep)) toplamSebep[kk]+=a.sebep[kk]||0;
  const tb=t.hits.filter(h=>h.r>rA&&h.r<rB);
  for(const th of tb){
    // TÜM analitik kesişimler arasında en yakınını ara (bant filtresi YOK)
    let enD=1e9, en=null;
    for(const ah of a.hits){ const d=len([ah.pos[0]-th.pos[0],0,ah.pos[2]-th.pos[2]]); if(d<enD){enD=d;en=ah;} }
    if(en && enD<1.0){
      eslesen++;
      if(!(en.r>rA && en.r<rB)){ sebepler.bantKenari++;
        if(ornek.length<4) ornek.push({gercekR:+th.r.toFixed(3), analitikR:+en.r.toFixed(3), k:en.k}); }
    } else { sebepler.hicYok++; if(ornek.length<4) ornek.push({gercekR:+th.r.toFixed(3), enYakin:+enD.toFixed(2), analitikSayi:a.hits.length, sebep:a.sebep}); }
  }
}
console.log(`KMAX=8 ile: eşleşen ${eslesen}`);
console.log(`  bant KENARINDA kaçan (analitik r bandın az dışında): ${sebepler.bantKenari}`);
console.log(`  hiç analitik karşılığı olmayan: ${sebepler.hicYok}`);
console.log(`analitik döngü kırpma sebepleri (toplam): ${JSON.stringify(toplamSebep)}`);
if(ornek.length) console.log('örnekler:', JSON.stringify(ornek.slice(0,4)));
