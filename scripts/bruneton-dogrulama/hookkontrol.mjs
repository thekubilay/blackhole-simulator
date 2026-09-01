// HEDEFLİ SINAMA: "ilk kesişim bandı ıskalıyor, ışın deliğin arkasından dolanıp
// İKİNCİ kesişimde disk bandına giriyor; kod bunu atlıyor" iddiası.
import { buildDeflectionTableAdaptive, tableDeflection, KMU } from './bruneton.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a)); const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const {data:D}=buildDeflectionTableAdaptive(1.0);
const uApsis=(e2)=>1/3+2/3*Math.sin(Math.asin(clamp((2/KMU)*e2-1,-1,1))/3);
const DISK_IN=2.32, R_OUT=13.5, rA=DISK_IN-1.5, rB=R_OUT+0.5;

function analyse(p,v){
  const r0=len(p), pr=norm(p);
  let ez=cross(pr,v); const ezl=len(ez);
  if(ezl<=1e-5) return null;
  ez=[ez[0]/ezl,ez[1]/ezl,ez[2]/ezl];
  const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  const defl=tableDeflection(D,u,ud,e2);
  if(defl<0) return {captured:true};
  const minR = ud>0 ? 1/uApsis(e2) : r0;
  let td=cross([0,1,0],ez); const tdl=len(td);
  if(tdl<=1e-5) return {skip:true, parallel:true};
  td=[td[0]/tdl,td[1]/tdl,td[2]/tdl];
  if(dot(td,ey)<0) td=[-td[0],-td[1],-td[2]];
  const alpha=Math.acos(clamp(dot(pr,td),-1,1));
  const psiMax=delta+defl;
  const kodMarch = (minR<=rB) && (alpha<psiMax);          // ŞU ANKİ KOD
  const hookMarch= (minR<=rB) && (alpha<psiMax || alpha+Math.PI<psiMax); // ÖNERİLEN
  return {skip:!kodMarch, kodMarch, hookMarch, alpha, psiMax, minR, e2,
          ikinciKesisimAralikta: alpha+Math.PI < psiMax};
}
function truth(p0,v0){
  let p=[...p0],v=[...v0]; const h2=dot(cross(p,v),cross(p,v)); const dt=0.003; const hits=[];
  for(let i=0;i<600000;i++){
    const r2=dot(p,p),r=Math.sqrt(r2);
    if(r<1) return hits;
    if(r>60&&dot(p,v)>0) return hits;
    const c=-1.5*h2/(r2*r2*r); const pp=[...p];
    v=[v[0]+c*p[0]*dt,v[1]+c*p[1]*dt,v[2]+c*p[2]*dt];
    p=[p[0]+v[0]*dt,p[1]+v[1]*dt,p[2]+v[2]*dt];
    if(pp[1]*p[1]<0){const t=pp[1]/(pp[1]-p[1]);
      hits.push(Math.hypot(pp[0]+(p[0]-pp[0])*t, pp[2]+(p[2]-pp[2])*t));}
  }
  return hits;
}
let farkli=0, psiBuyuk=0, ikinciVar=0, atlanan=0, yanlisAtlanan=0, ikiKesisimliGercek=0;
const ornek=[];
// foton halkası çevresini YOĞUN örnekle: güçlü bükülme tam orada
for(const camPos of [[2.2,1.15,13.2],[1.5,0.8,8.5],[4,3,20],[0.5,2.0,6.5]]){
  const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
  const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
  const aspect=1512/747, tanF=Math.tan(55*Math.PI/360);
  for(let py=0;py<90;py++) for(let px=0;px<180;px++){
    // merkeze doğru sıkıştır: deliğin çevresi yoğun örneklensin
    const sx=Math.sign((px+0.5)/180*2-1)*Math.pow(Math.abs((px+0.5)/180*2-1),1.8);
    const sy=Math.sign(1-(py+0.5)/90*2)*Math.pow(Math.abs(1-(py+0.5)/90*2),1.8);
    const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                   fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                   fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
    const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
    const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
    const a=analyse(camPos,v);
    if(!a||a.captured) continue;
    if(a.psiMax>Math.PI) psiBuyuk++;
    if(a.ikinciKesisimAralikta) ikinciVar++;
    if(a.kodMarch!==a.hookMarch){ farkli++; if(ornek.length<3) ornek.push(a); }
    if(!a.skip) continue;
    atlanan++;
    const hits=truth(camPos,v);
    if(hits.length>=2) ikiKesisimliGercek++;
    if(hits.some(r=>r>rA&&r<rB)){ yanlisAtlanan++; if(ornek.length<6) ornek.push({...a, gercek:hits.map(x=>+x.toFixed(2))}); }
  }
}
console.log(`psi_max > pi olan ışın: ${psiBuyuk}`);
console.log(`ikinci kesişim süpürme aralığında (alpha+pi < psi_max): ${ikinciVar}`);
console.log(`ŞU ANKİ KOD ile HOOK'un önerisi FARKLI karar veren ışın: ${farkli}`);
console.log(`atlanan ışın: ${atlanan}, bunlardan gerçekte disk bandını kesen: ${yanlisAtlanan}`);
console.log(`atlananlar arasında gerçekte İKİ düzlem geçişi olan: ${ikiKesisimliGercek}`);
if(ornek.length) console.log('örnek:', JSON.stringify(ornek[0]));
