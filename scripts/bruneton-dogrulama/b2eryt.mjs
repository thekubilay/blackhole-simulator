// er.y gerçekten sıfır mı? hp.y=0 yapmak yarıçapı bozuyor mu?
import { buildDeflectionTableAdaptive, buildInverseRadiusTable, sample2, texCoord, KMU, IW, IH } from './bruneton.mjs';
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
const tableRaw=(u,e2)=>{const tx=texCoord(deflTexU(e2),512);
  return {apsis:sample2(D,512,512,tx,texCoord(1,512))[0], raw:sample2(D,512,512,tx,texCoord(deflTexV(e2,u),512))[0]};};
const phiUbT=(e2)=>(1+e2)/(1/3+2*e2*Math.sqrt(e2));
const invRad=(e2,phi)=>sample2(U,IW,IH,texCoord(1/(1+6*e2),IW),texCoord(clamp(phi/phiUbT(e2),0,1),IH))[0];
const R_OUT=13.5, uDiskIn=2.32;
const camPos=[2.2,1.15,13.2];
const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
const aspect=1512/747, tanF=Math.tan(55*Math.PI/360);
let maxEry=0, maxRfark=0, n=0; let ornek=null;
for(let py=0;py<80;py++) for(let px=0;px<160;px++){
  const sx=((px+0.5)/160*2-1)*0.6, sy=(1-(py+0.5)/80*2)*0.6;
  const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                 fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                 fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
  const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
  const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
  let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) continue;
  ez=mul(ez,1/ezl); const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  const {raw,apsis:ap2}=tableRaw(u,e2);
  let defl=raw; if(ud>0) defl=e2<KMU?2*ap2-raw:-1;
  if(e2<KMU&&u>2/3) defl=-1;
  const esc=defl>=0;
  const dAcc=ud>0?raw:2*ap2-raw;
  const phiC=dAcc+Math.PI-delta, phiA=ap2+Math.PI/2, pub=phiUbT(e2);
  const psiMax=esc?delta+defl:1e9;
  let td2=cross([0,1,0],ez); const tdl2=len(td2); if(tdl2<=1e-5) continue;
  td2=mul(td2,1/tdl2); if(dot(td2,ey)<0) td2=mul(td2,-1);
  const alpha2=Math.acos(clamp(dot(pr,td2),-1,1));
  for(let k=0;k<6;k++){
    const psi=alpha2+k*Math.PI;
    if(psi>=psiMax) break;
    const phi=phiC+psi;
    const phiE=(e2<KMU&&phi>phiA)?2*phiA-phi:phi;
    if(phiE<0||phiE>pub) break;
    const uk=invRad(e2,phiE); if(uk>=1) break;
    const rr=1/Math.max(uk,1e-6); if(rr>R_OUT+0.5) continue;
    const er=add(mul(pr,Math.cos(psi)), mul(ey,Math.sin(psi)));
    const hp=mul(er,rr); const hpy=hp[1]; hp[1]=0;
    const rxz=Math.hypot(hp[0],hp[2]);
    n++;
    if(Math.abs(er[1])>maxEry){ maxEry=Math.abs(er[1]); }
    const fark=Math.abs(rxz-rr);
    if(fark>maxRfark){ maxRfark=fark; ornek={px,py,rr:+rr.toFixed(4),rxz:+rxz.toFixed(4),ery:er[1].toExponential(2),hpy:hpy.toExponential(2),k}; }
  }
}
console.log(`${n} kesişim incelendi`);
console.log(`max |er.y|            : ${maxEry.toExponential(3)}`);
console.log(`max |length(hp.xz) - rr| : ${maxRfark.toExponential(3)} birim`);
console.log('en kötü örnek:', JSON.stringify(ornek));
