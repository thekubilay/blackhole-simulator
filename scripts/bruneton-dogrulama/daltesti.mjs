// DAL YÖN TESTİ: tableDefl'deki apsis-simetrisi dalı hangi yönde doğru?
//   MEVCUT KOD : ud > 0 (içe giden) → 2Δ_apsis − Δ ; ud < 0 (dışa) → ham Δ
//   ÖNERİLEN   : ud < 0 (dışa)      → 2Δ_apsis − Δ ; ud > 0 (içe) → ham Δ
// Ölçüt: kaçış yönü δ' = δ + dönüş, yüksek doğrulukta RK4 referansına karşı.
import { buildDeflectionTableAdaptive, sample2, texCoord, refEscapeAngle, KMU } from './bruneton.mjs';
const {data:D}=buildDeflectionTableAdaptive(1.0);
const deflTexU=(e2)=>e2<KMU?0.5-Math.sqrt(-Math.log(1-e2/KMU)/50):0.5+Math.sqrt(-Math.log(1-KMU/e2)/50);
const deflTexV=(e2,u)=>{ if(e2>KMU){const x=u<2/3?-Math.sqrt(2/3-u):Math.sqrt(u-2/3);
    return (Math.sqrt(2/3)+x)/(Math.sqrt(2/3)+Math.sqrt(1/3));}
  const ua=1/3+2/3*Math.sin(Math.asin(Math.max(-1,Math.min(1,(2/KMU)*e2-1)))/3);
  return 1-Math.sqrt(Math.max(1-u/ua,0)); };
function lookup(u,ud,e2,flipWhenInbound){
  if(e2<KMU && u>2/3) return -1;
  const tu=texCoord(deflTexU(e2),512);
  const ap=sample2(D,512,512,tu,texCoord(1,512))[0];
  let d=sample2(D,512,512,tu,texCoord(deflTexV(e2,u),512))[0];
  const flip = flipWhenInbound ? (ud>0) : (ud<0);
  if(flip) d = e2<KMU ? 2*ap-d : -1;
  return d;
}
function sweep(flipWhenInbound){
  const eIn=[], eOut=[]; let capKavga=0;
  for(const rCam of [6,8,13.2,20,30,44]){
    for(let k=1;k<=200;k++){
      const delta=Math.PI*(1-k/201);
      const u=1/rCam, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
      const ref=refEscapeAngle(u,ud);
      const d=lookup(u,ud,e2,flipWhenInbound);
      if(ref===null||d<0){ if((ref===null)!==(d<0)) capKavga++; continue; }
      (ud>0?eIn:eOut).push(Math.abs((delta+d)-ref));
    }
  }
  const st=a=>{a.sort((x,y)=>x-y);return a.length?{med:a[a.length>>1],max:a[a.length-1],n:a.length}:{med:0,max:0,n:0};};
  return {icee:st(eIn), disa:st(eOut), capKavga};
}
const mevcut=sweep(true), oneri=sweep(false);
const f=(s)=>`medyan ${(s.med*1e3).toFixed(4).padStart(9)} mrad  max ${(s.max*1e3).toFixed(2).padStart(8)} mrad  (${s.n} ışın)`;
console.log('MEVCUT KOD  (flip: ud>0, içe giden):');
console.log('  içe giden ışınlar : '+f(mevcut.icee));
console.log('  dışa giden ışınlar: '+f(mevcut.disa));
console.log('  yakalama kararı referansla çelişen: '+mevcut.capKavga);
console.log('ÖNERİLEN    (flip: ud<0, dışa giden):');
console.log('  içe giden ışınlar : '+f(oneri.icee));
console.log('  dışa giden ışınlar: '+f(oneri.disa));
console.log('  yakalama kararı referansla çelişen: '+oneri.capKavga);
