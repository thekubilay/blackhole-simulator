// B2 dalının kare haritası vs GERÇEK. Amaç: ekrandaki yamuk kenarı
// çevrimdışı yeniden üretip sebebini bulmak.
import { buildDeflectionTableAdaptive, buildInverseRadiusTable,
         sample2, texCoord, KMU, IW, IH } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]; const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const {data:D}=buildDeflectionTableAdaptive(1.0); const U=buildInverseRadiusTable();
const uApsisT=(e2)=>1/3+2/3*Math.sin(Math.asin(clamp((2/KMU)*e2-1,-1,1))/3);
const deflTexU=(e2)=>e2<KMU?0.5-Math.sqrt(-Math.log(Math.max(1-e2/KMU,1e-20))*0.02)
                           :0.5+Math.sqrt(-Math.log(Math.max(1-KMU/e2,1e-20))*0.02);
const deflTexV=(e2,u)=>{ if(e2>KMU){const x=u<2/3?-Math.sqrt(2/3-u):Math.sqrt(u-2/3);
    return (Math.sqrt(2/3)+x)/(Math.sqrt(2/3)+Math.sqrt(1/3));}
  return 1-Math.sqrt(Math.max(1-u/uApsisT(e2),0)); };
function tableRaw(u,e2){ const tx=texCoord(deflTexU(e2),512);
  return { apsis: sample2(D,512,512,tx,texCoord(1,512))[0],
           raw:   sample2(D,512,512,tx,texCoord(deflTexV(e2,u),512))[0] }; }
const phiUbT=(e2)=>(1+e2)/(1/3+2*e2*Math.sqrt(e2));
const invRad=(e2,phi)=>sample2(U,IW,IH,texCoord(1/(1+6*e2),IW),texCoord(clamp(phi/phiUbT(e2),0,1),IH))[0];
const R_OUT=13.5, uDiskIn=2.32;
function b2(p,v){
  const r0=len(p), pr=norm(p);
  let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) return {sinif:'radyal'};
  ez=mul(ez,1/ezl); const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  const {raw,apsis:ap2}=tableRaw(u,e2);
  let defl=raw; if(ud>0) defl = e2<KMU ? 2*ap2-raw : -1;
  if(e2<KMU && u>2/3) defl=-1;
  const esc=defl>=0;
  const dAcc = ud>0 ? raw : 2*ap2-raw;
  const phiC=dAcc+Math.PI-delta, phiA=ap2+Math.PI/2, pub=phiUbT(e2);
  const psiMax = esc ? delta+defl : 1e9;
  let td2=cross([0,1,0],ez); const tdl2=len(td2);
  let diskVar=false, kirilma='-', tam=true;
  // shader ile aynı: yakalanan ışın B2'ye girmez, marşa düşer
  if(tdl2>1e-5 && esc){
    td2=mul(td2,1/tdl2); if(dot(td2,ey)<0) td2=mul(td2,-1);
    const alpha2=Math.acos(clamp(dot(pr,td2),-1,1));
    for(let k=0;k<6;k++){
      const psi=alpha2+k*Math.PI;
      if(psi>=psiMax){ kirilma='psiMax'; break; }
      const phi=phiC+psi;
      const phiE=(e2<KMU && phi>phiA) ? 2*phiA-phi : phi;
      if(phiE<0){ kirilma='phiNeg'; break; }
      if(phiE>pub){ kirilma='pub'; tam=false; break; }
      const uk=invRad(e2,phiE);
      if(uk>=1){ kirilma='ufuk'; break; }
      const rr=1/Math.max(uk,1e-6);
      if(rr>R_OUT+0.5) continue;
      if(rr>uDiskIn && rr<R_OUT) diskVar=true;
    }
  }
  // 'k' = yakalandı AMA önünde disk var (gölge önü diski) — ayrı sınıf,
  // yoksa 'K' bu bilgiyi yutar ve gölge bölgesindeki bozulma görünmez.
  // Yakalanan ışın marşa gider: B2 onun sonucunu belirlemez. Haritada
  // '?' ile işaretlenir ve farka SAYILMAZ.
  // tam değilse B2 pikseli sahiplenmez -> marşa düşer, '?'
  return { sinif: (!esc || !tam) ? '?' : (diskVar ? 'D' : '.'), kirilma, e2, esc, diskVar };
}
function truth(p0,v0){
  let p=[...p0],v=[...v0]; const h2=dot(cross(p,v),cross(p,v)); const dt=0.004;
  let diskVar=false;
  for(let i=0;i<300000;i++){
    const r2=dot(p,p),r=Math.sqrt(r2);
    if(r<1) return {sinif: diskVar?'k':'K', diskVar};
    if(r>60&&dot(p,v)>0) return {sinif: diskVar?'D':'.', diskVar};
    const c=-1.5*h2/(r2*r2*r); const pp=[...p];
    v=[v[0]+c*p[0]*dt,v[1]+c*p[1]*dt,v[2]+c*p[2]*dt];
    p=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt];
    if(pp[1]*p[1]<0){const t=pp[1]/(pp[1]-p[1]);
      const rr=Math.hypot(pp[0]+(p[0]-pp[0])*t, pp[2]+(p[2]-pp[2])*t);
      if(rr>uDiskIn&&rr<R_OUT) diskVar=true;}
  }
  return {sinif: diskVar?'D':'.', diskVar};
}
const camPos=[2.2,1.15,13.2];
const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
const aspect=1512/747, tanF=Math.tan(55*Math.PI/360);
const W=104,H=40; const satirB=[],satirT=[],satirF=[];
const kirilmaSay={};
for(let py=0;py<H;py++){
  let a='',b='',c='';
  for(let px=0;px<W;px++){
    const sx=((px+0.5)/W*2-1)*0.55, sy=(1-(py+0.5)/H*2)*0.55;  // merkeze yakınlaş
    const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                   fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                   fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
    const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
    const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
    const B=b2(camPos,v), T=truth(camPos,v);
    const esitMi = B.sinif==='?' || B.sinif===T.sinif || (B.sinif==='D'&&T.sinif==='k');
    a+=B.sinif; b+=T.sinif; c+= (esitMi?' ':'X');
    if(!esitMi) kirilmaSay[B.sinif+'->'+T.sinif+' ('+B.kirilma+')']=(kirilmaSay[B.sinif+'->'+T.sinif+' ('+B.kirilma+')']||0)+1;
  }
  satirB.push(a); satirT.push(b); satirF.push(c);
}
console.log('B2 (K=gölge, k=gölge+önünde disk, D=disk, .=yıldız)  GERÇEK                                   FARK');
for(let i=0;i<H;i++) console.log(satirB[i]+' | '+satirT[i]+' | '+satirF[i]);
console.log('\nFARK dağılımı:', JSON.stringify(kirilmaSay));
