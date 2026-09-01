// SHADER'IN B2 DALININ BİREBİR TRANSLİTERASYONU, gerçeğe karşı.
// Amaç: GLSL'e yazarken işaret/değişken hatası yapıldı mı? Buradaki kod
// lensShader.ts'teki bloğun satır satır JS karşılığıdır — biri değişirse
// diğeri de değişmeli.
import { buildDeflectionTableAdaptive, buildInverseRadiusTable,
         sample2, texCoord, KMU, IW, IH } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]; const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const {data:D}=buildDeflectionTableAdaptive(1.0); const U=buildInverseRadiusTable();
// --- shader yardımcıları (birebir) ---
const uApsisT=(e2)=>1/3+2/3*Math.sin(Math.asin(clamp((2/KMU)*e2-1,-1,1))/3);
const deflTexU=(e2)=>e2<KMU?0.5-Math.sqrt(-Math.log(Math.max(1-e2/KMU,1e-20))*0.02)
                           :0.5+Math.sqrt(-Math.log(Math.max(1-KMU/e2,1e-20))*0.02);
const deflTexV=(e2,u)=>{ if(e2>KMU){const x=u<2/3?-Math.sqrt(2/3-u):Math.sqrt(u-2/3);
    return (Math.sqrt(2/3)+x)/(Math.sqrt(2/3)+Math.sqrt(1/3));}
  return 1-Math.sqrt(Math.max(1-u/uApsisT(e2),0)); };
function tableRaw(u,e2){
  const tx=texCoord(deflTexU(e2),512);
  return { apsis: sample2(D,512,512,tx,texCoord(1,512))[0],
           raw:   sample2(D,512,512,tx,texCoord(deflTexV(e2,u),512))[0] };
}
const phiUbT=(e2)=>(1+e2)/(1/3+2*e2*Math.sqrt(e2));
const tableInvRad=(e2,phi)=>sample2(U,IW,IH,texCoord(1/(1+6*e2),IW),
                                    texCoord(clamp(phi/phiUbT(e2),0,1),IH))[0];
function tableDefl(u,ud,e2){
  const {raw,apsis}=tableRaw(u,e2);
  if(e2<KMU && u>2/3) return {d:-1, apsisDefl:apsis};
  let d=raw;
  if(ud>0) d = e2<KMU ? 2*apsis-d : -1;
  return {d, apsisDefl:apsis};
}
const R_OUT=13.5, uDiskIn=2.32;
// --- B2 dalı (birebir) ---
function b2(p,v){
  const r0=len(p), pr=norm(p);
  let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) return null;
  ez=mul(ez,1/ezl); const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  const {d:defl}=tableDefl(u,ud,e2);
  const {raw,apsis:ap2}=tableRaw(u,e2);
  const dAcc = ud>0 ? raw : 2*ap2-raw;
  const phiC = dAcc + Math.PI - delta;
  const phiA = ap2 + Math.PI/2;
  const pub  = phiUbT(e2);
  const esc  = defl>=0;
  const psiMax = esc ? delta+defl : 1e9;
  let td2=cross([0,1,0],ez); const tdl2=len(td2); if(tdl2<=1e-5) return {hits:[],esc};
  td2=mul(td2,1/tdl2); if(dot(td2,ey)<0) td2=mul(td2,-1);
  const alpha2=Math.acos(clamp(dot(pr,td2),-1,1));
  const hits=[]; let tam=true;
  for(let k=0;k<6;k++){
    const psi=alpha2+k*Math.PI;
    if(psi>=psiMax) break;
    const phi=phiC+psi;
    const phiE=(e2<KMU && phi>phiA) ? 2*phiA-phi : phi;
    if(phiE<0) break;
    if(phiE>pub){ tam=false; break; }
    const uk=tableInvRad(e2,phiE);
    if(uk>=1) break;
    const rr=1/Math.max(uk,1e-6);
    if(rr>R_OUT+0.5) continue;
    const er=add(mul(pr,Math.cos(psi)), mul(ey,Math.sin(psi)));
    const et=add(mul(pr,-Math.sin(psi)), mul(ey,Math.cos(psi)));
    const hp=mul(er,rr); hp[1]=0;
    const sgnk=(e2<KMU) ? (phi>phiA?-1:1) : (ud>0?1:-1);
    const udk=Math.sqrt(Math.max(e2+uk*uk*uk-uk*uk,0))*sgnk;
    const vk=norm(add(et, mul(er, -udk/Math.max(uk,1e-6))));
    hits.push({r:rr,pos:hp,dir:vk,k,sgnk,phi,phiA,e2});
  }
  return {hits,esc,tam};
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
      hits.push({r:Math.hypot(pp[0]+(p[0]-pp[0])*t, pp[2]+(p[2]-pp[2])*t),
                 pos:[pp[0]+(p[0]-pp[0])*t,0,pp[2]+(p[2]-pp[2])*t], dir:norm(pv)});}
  }
  return {hits,captured:false};
}
// SADECE sampleDisk'in gerçekten çizdiği bant önemli: [uDiskIn, R_OUT]
const inDisk=h=>h.r>uDiskIn && h.r<R_OUT;
let eslesen=0,eksik=0,fazla=0,escKavga=0; const rE=[],pE=[],dE=[];
const perK={}; const kotu=[];
for(const camPos of [[2.2,1.15,13.2],[1.5,0.8,8.5],[4,3,20],[0.5,2.0,6.5]]){
  const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
  const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
  const aspect=1512/747, tanF=Math.tan(55*Math.PI/360);
  for(let py=0;py<56;py++) for(let px=0;px<112;px++){
    const sx=(px+0.5)/112*2-1, sy=1-(py+0.5)/56*2;
    const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                   fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                   fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
    const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
    const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
    const a=b2(camPos,v); if(!a) continue;
    if(!a.esc || !a.tam) continue;   // marşa düşen piksel B2'nin sorumluluğunda değil
    const t=truth(camPos,v);
    if(a.esc === t.captured) escKavga++;
    const tb=t.hits.filter(inDisk), ab=a.hits.filter(inDisk);
    const kul=new Array(ab.length).fill(false);
    for(const th of tb){
      let enD=1e9,en=-1;
      for(let j=0;j<ab.length;j++){ if(kul[j])continue;
        const dd=len([ab[j].pos[0]-th.pos[0],0,ab[j].pos[2]-th.pos[2]]); if(dd<enD){enD=dd;en=j;} }
      if(en<0||enD>1.0){ eksik++; continue; }
      kul[en]=true; eslesen++;
      rE.push(Math.abs(ab[en].r-th.r)/th.r); pE.push(enD);
      const de=Math.acos(clamp(dot(ab[en].dir,th.dir),-1,1));
      dE.push(de);
      const kk=ab[en].k;
      (perK[kk]=perK[kk]||[]).push(de);
      if(de>0.3 && kotu.length<6) kotu.push({k:kk,sgnk:ab[en].sgnk,
        phi:+ab[en].phi.toFixed(3),phiA:+ab[en].phiA.toFixed(3),e2:+ab[en].e2.toFixed(5),
        r:+ab[en].r.toFixed(2), hataDeg:+(de*180/Math.PI).toFixed(1)});
    }
    fazla += kul.filter(x=>!x).length;
  }
}
const q=(a,f)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*f))];};
console.log(`SHADER B2 TRANSLİTERASYONU vs GERÇEK  (4 kamera x 6272 piksel)`);
console.log(`  disk bandı kesişimi: eşleşen ${eslesen}, EKSİK ${eksik} (%${(100*eksik/(eslesen+eksik)).toFixed(2)}), FAZLA ${fazla}`);
console.log(`  kaçış/yakalanma kararı çelişkisi: ${escKavga}`);
console.log(`  yarıçap bağıl: medyan ${(q(rE,.5)*100).toFixed(3)}%  p99 ${(q(rE,.99)*100).toFixed(2)}%`);
console.log(`  konum        : medyan ${q(pE,.5).toFixed(4)}  p99 ${q(pE,.99).toFixed(3)} birim`);
console.log(`  YÖN          : medyan ${(q(dE,.5)*1e3).toFixed(2)} mrad  p99 ${(q(dE,.99)*1e3).toFixed(1)} mrad  MAX ${(q(dE,1)*180/Math.PI).toFixed(1)} derece`);
console.log('  k bazında yön hatası:');
for(const kk of Object.keys(perK).sort()){ const a=perK[kk];
  console.log(`    k=${kk}: ${a.length} kesişim, medyan ${(q(a,.5)*1e3).toFixed(2)} mrad, p99 ${(q(a,.99)*1e3).toFixed(1)} mrad, MAX ${(q(a,1)*180/Math.PI).toFixed(1)} derece`); }
if(kotu.length) console.log('  17 dereceden kötü örnekler:', JSON.stringify(kotu));
