// YAKALANAN IŞINLARIN disk kesişimleri (gölgenin önündeki iç disk).
// Bu ışınların APSİSİ YOKTUR (e2 >= KMU, içe giden): u tekdüze artar, ufka düşer.
// Dolayısıyla phi_c = Delta_ham + pi - delta  (2*Delta_apsis düzeltmesi YOK)
// ve yansıtma da yok. Süpürme ufka varınca biter: psi_h = phi_h - phi_c,
// phi_h = Delta_ufuk + atan2(1, e).
import { buildDeflectionTableAdaptive, buildInverseRadiusTable,
         sample2, texCoord, phiUb, KMU, IW, IH } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]; const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const {data:D}=buildDeflectionTableAdaptive(1.0); const U=buildInverseRadiusTable();
const invRad=(e2,phi)=>sample2(U,IW,IH,texCoord(1/(1+6*e2),IW),texCoord(clamp(phi/phiUb(e2),0,1),IH))[0];
const deflTexU=(e2)=>e2<KMU?0.5-Math.sqrt(-Math.log(1-e2/KMU)/50):0.5+Math.sqrt(-Math.log(1-KMU/e2)/50);
const deflTexV=(e2,u)=>{ if(e2>KMU){const x=u<2/3?-Math.sqrt(2/3-u):Math.sqrt(u-2/3);
    return (Math.sqrt(2/3)+x)/(Math.sqrt(2/3)+Math.sqrt(1/3));}
  const ua=1/3+2/3*Math.sin(Math.asin(clamp((2/KMU)*e2-1,-1,1))/3);
  return 1-Math.sqrt(Math.max(1-u/ua,0)); };
const rawDefl=(e2,u)=>sample2(D,512,512,texCoord(deflTexU(e2),512),texCoord(deflTexV(e2,u),512))[0];
const lastRow=(e2)=>sample2(D,512,512,texCoord(deflTexU(e2),512),texCoord(1,512))[0];
const DISK_IN=2.32, R_OUT=13.5, rA=DISK_IN-1.5, rB=R_OUT+0.5;

function analyticCaptured(p,v){
  const r0=len(p), pr=norm(p);
  let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) return null;
  ez=mul(ez,1/ezl); const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  if(!(e2>=KMU && ud>0)) return {yok:true};       // bu betik yalnız bu dalı sınar
  const e=Math.sqrt(e2);
  const phiC = rawDefl(e2,u) + Math.PI - delta;
  const phiH = lastRow(e2) + Math.atan2(1, e);
  const psiH = phiH - phiC;
  let td=cross([0,1,0],ez); const tdl=len(td); if(tdl<=1e-5) return {hits:[]};
  td=mul(td,1/tdl); if(dot(td,ey)<0) td=mul(td,-1);
  const alpha=Math.acos(clamp(dot(pr,td),-1,1));
  const hits=[]; const kirpma=[];
  for(let k=0;k<6;k++){
    const psi=alpha+k*Math.PI;
    const phi=phiC+psi;
    // psi_h TAHMİNİ yerine tablodan doğrudan ufka varışı sına: u >= 1 olduğu
    // anda ışın yutulmuştur, sonraki kesişimler fizik dışıdır.
    if(phi>phiUb(e2)){ kirpma.push(['pub',k,+phi.toFixed(3),+phiUb(e2).toFixed(3)]); break; }
    const uu=Math.max(invRad(e2,phi),1e-9), rr=1/uu;
    if(uu>=1.0){ kirpma.push(['ufuk',k,+rr.toFixed(3)]); break; }
    const er=add(mul(pr,Math.cos(psi)), mul(ey,Math.sin(psi)));
    hits.push({r:rr,pos:mul(er,rr),psi});
  }
  return {hits,psiH,alpha,e2,kirpma,phiC};
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
let n=0,eslesen=0,eksik=0,fazla=0; const rErr=[],posErr=[]; const ornekEksik=[];
for(let py=0;py<72;py++) for(let px=0;px<144;px++){
  const sx=(px+0.5)/144*2-1, sy=1-(py+0.5)/72*2;
  const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                 fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                 fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
  const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
  const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
  const a=analyticCaptured(camPos,v); if(!a||a.yok) continue;
  const t=truth(camPos,v); if(!t.captured) continue;
  n++;
  const tb=t.hits.filter(h=>h.r>rA&&h.r<rB);
  const kullanildi=new Array(a.hits.length).fill(false);
  for(const th of tb){
    let enD=1e9,en=-1;
    for(let j=0;j<a.hits.length;j++){ if(kullanildi[j])continue;
      const d=len([a.hits[j].pos[0]-th.pos[0],0,a.hits[j].pos[2]-th.pos[2]]); if(d<enD){enD=d;en=j;} }
    if(en<0||enD>1.0){ eksik++;
      if(ornekEksik.length<5) ornekEksik.push({gercekR:+th.r.toFixed(3), analitikSayi:a.hits.length,
        analitikR:a.hits.map(h=>+h.r.toFixed(2)), kirpma:a.kirpma, e2:+a.e2.toFixed(4),
        phiC:+a.phiC.toFixed(3), alpha:+a.alpha.toFixed(3)});
      continue; }
    kullanildi[en]=true; eslesen++;
    rErr.push(Math.abs(a.hits[en].r-th.r)/th.r); posErr.push(enD);
  }
  fazla += kullanildi.filter((x,j)=>!x && a.hits[j].r>rA && a.hits[j].r<rB).length;
}
const st=a=>{a.sort((x,y)=>x-y);return a.length?{med:a[a.length>>1],p95:a[Math.floor(a.length*0.95)],max:a[a.length-1]}:null;};
const R2=st(rErr), P=st(posErr);
console.log(`yakalanan ışın (e2>=KMU, içe giden): ${n}`);
console.log(`  bant içi kesişim: eşleşen ${eslesen}, EKSİK ${eksik}, FAZLA ${fazla}`);
if(R2) console.log(`  yarıçap bağıl hata: medyan ${(R2.med*100).toFixed(3)}%  p95 ${(R2.p95*100).toFixed(2)}%  max ${(R2.max*100).toFixed(2)}%`);
if(P) console.log(`  konum hatası: medyan ${P.med.toFixed(4)}  p95 ${P.p95.toFixed(3)}  max ${P.max.toFixed(3)} birim`);
console.log('EKSİK örnekleri:'); for(const o of ornekEksik) console.log('  '+JSON.stringify(o));
