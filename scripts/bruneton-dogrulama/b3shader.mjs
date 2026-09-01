// FAZ B3 — 𝕌'nun φ ekseni bizim. Shader dalının BİREBİR JS karşılığı,
// gerçek marşa karşı. b2shader.mjs'in ardılı; fark üç yerde:
//   1. eksen tavanı Φ = min(φ_end(e²), CAP), φ_end = Δ_son + (apsis ? π/2
//      : atan(1/e)) — 𝔻'nin zaten çekilen son satırından, EK DOKU YOK.
//   2. YAKALANAN ışın da B2'ye girer: ψ_max = Φ − φ_c (ufka kadar).
//   3. apsisi olmayan DIŞA giden ışında (e² ≥ KMU, u̇ < 0) tablo eğrisi GERİ
//      kat edilir: φ = φ_c − ψ. Eski kod orada apsis yansıtması uyguluyordu;
//      apsis yok, o formül geçersizdi.
// Kullanım: node b3shader.mjs [W] [H] [CAP]        (sevk edilen: 128 64 16)
//   ESKI=1        → eski B2 yolunu (phi_ub + yakalanan marşta) ölç, karşılaştır
//   ESKIISARET=1  → yalnız 3 numaralı düzeltmeyi geri al: apsissiz dışa giden
//                   ışında eski apsis-yansıtması. 'DIŞA BAKAN TARAMA' bölümü
//                   o zaman 2436/2436 kesişimi KAYBEDER — düzeltmenin kanıtı.
import { buildDeflectionTableAdaptive, buildInverseRadiusTableB3, buildInverseRadiusTable,
         sample2, texCoord, phiEndFromDefl, KMU } from './bruneton.mjs';

const W = +(process.argv[2] || 64), H = +(process.argv[3] || 32), CAP = +(process.argv[4] || 8);
const ESKI = process.env.ESKI === '1';        // eski (B2) yolunu ölç, karşılaştırma için

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.sqrt(dot(a,a));
const norm=a=>{const l=len(a);return [a[0]/l,a[1]/l,a[2]/l];};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];

const {data:D} = buildDeflectionTableAdaptive(1.0);
const U = ESKI ? buildInverseRadiusTable() : buildInverseRadiusTableB3(D, {W,H,cap:CAP});
const UW = ESKI ? 64 : W, UH = ESKI ? 32 : H;

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
/** YENİ: eksen tavanı. deflEnd = 𝔻'nin son satırı (zaten çekiliyor). */
const phiAxisT=(e2,deflEnd)=>Math.min(phiEndFromDefl(e2,deflEnd), CAP);
// Sütun koordinatı artık 𝔻'ninkiyle AYNI (deflTexU) — shader'da zaten
// hesaplanmış 'tx' yeniden kullanılır, 1/(1+6e²) çarpanı kalkar.
const tableInvRad=(e2,phi,PH)=>sample2(U,UW,UH,
  texCoord(ESKI?1/(1+6*e2):deflTexU(e2),UW), texCoord(clamp(phi/PH,0,1),UH))[0];
function tableDefl(u,ud,e2){
  const {raw,apsis}=tableRaw(u,e2);
  if(e2<KMU && u>2/3) return {d:-1, apsisDefl:apsis};
  let d=raw;
  if(ud>0) d = e2<KMU ? 2*apsis-d : -1;
  return {d, apsisDefl:apsis};
}

let DISA_GIDEN_APSISSIZ=0;
const R_OUT=13.5;
let uDiskIn=2.32;

// --- B3 dalı (birebir) ---
function b3(p,v){
  const r0=len(p), pr=norm(p);
  let ez=cross(pr,v); const ezl=len(ez); if(ezl<=1e-5) return null;
  ez=mul(ez,1/ezl); const ey=cross(ez,pr);
  const delta=Math.acos(clamp(dot(pr,v),-1,1));
  const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
  const {d:defl}=tableDefl(u,ud,e2);
  const {raw,apsis:ap2}=tableRaw(u,e2);
  const esc = defl>=0;
  const apsisVar = e2 < KMU;
  // φ_c ve φ'nin ışın boyunca artıp azaldığı. Kilit: atan2(u,u̇) = π − δ her
  // zaman; apsisi OLMAYAN dışa giden ışında ise kameranın içe-giden daldaki
  // açısı raw + δ'dır ve ışın o dalı GERİ kat eder.
  let phiC, sgnPhi;
  if(apsisVar){
    phiC = (ud>0 ? raw : 2*ap2-raw) + Math.PI - delta; sgnPhi = 1;
  } else if(process.env.ESKIISARET === '1'){
    phiC = (ud>0 ? raw : 2*ap2-raw) + Math.PI - delta; sgnPhi = 1;   // eski (B2) — apsis yokken geçersiz
  } else {
    phiC = ud>0 ? raw + Math.PI - delta : raw + delta;
    sgnPhi = ud>0 ? 1 : -1;
    if(ud<0) DISA_GIDEN_APSISSIZ++;   // 'dışa bakan tarama'nın kapsadığı dal
  }
  const phiA = ap2 + Math.PI/2;
  const phiEnd = phiEndFromDefl(e2, ap2);
  const PH = ESKI ? phiUbT(e2) : phiAxisT(e2, ap2);
  const kapakli = !ESKI && phiEnd > CAP + 1e-9;    // tablo uca ULAŞMIYOR
  // ψ_max: kaçan ışında süpürülen toplam sahne açısı; YAKALANANDA ufka kadar.
  const psiMax = esc ? delta+defl : (ESKI ? 1e9 : phiEnd - phiC);
  let td2=cross([0,1,0],ez); const tdl2=len(td2); if(tdl2<=1e-5) return {hits:[],esc,tam:true};
  td2=mul(td2,1/tdl2); if(dot(td2,ey)<0) td2=mul(td2,-1);
  const alpha2=Math.acos(clamp(dot(pr,td2),-1,1));
  const hits=[]; let tam=true;
  for(let k=0;k<6;k++){
    const psi=alpha2+k*Math.PI;
    if(psi>=psiMax) break;
    const phi=phiC+sgnPhi*psi;
    const phiE=(apsisVar && phi>phiA) ? 2*phiA-phi : phi;
    if(phiE<0) break;                       // sonsuza kaçtı: sayım TAM
    if(phiE>PH){                            // eksenin ötesi
      if(kapakli){ tam=false; break; }      // tablo bilmiyor → marşa bırak
      continue;                             // uç noktanın ötesi: kesişim YOK
    }
    const uk=tableInvRad(e2,phiE,PH);
    if(uk>=1) break;
    const rr=1/Math.max(uk,1e-6);
    if(rr>R_OUT+0.5) continue;
    const er=add(mul(pr,Math.cos(psi)), mul(ey,Math.sin(psi)));
    const et=add(mul(pr,-Math.sin(psi)), mul(ey,Math.cos(psi)));
    const hp=mul(er,rr); hp[1]=0;
    // u̇ işareti: apsisli ışında apsisin tarafı; apsissizde ışın boyunca SABİT
    // ve kameranınkiyle aynı.
    const sgnk=apsisVar ? (phi>phiA?-1:1) : (ud>0?1:-1);
    const udk=Math.sqrt(Math.max(e2+uk*uk*uk-uk*uk,0))*sgnk;
    const vk=norm(add(et, mul(er, -udk/Math.max(uk,1e-6))));
    hits.push({r:rr,pos:hp,dir:vk,k,e2,phiE,PH,kapakli,apsisVar,ud,sgnk});
  }
  return {hits,esc,tam};
}

function truth(p0,v0){
  let p=[...p0],v=[...v0]; const L=cross(p,v); const h2=dot(L,L); const dt=0.0015; const hits=[];
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

const q=(a,f)=>{const b=a.slice().sort((x,y)=>x-y);return b.length?b[Math.min(b.length-1,Math.floor(b.length*f))]:NaN;};

function kosum(etiket, diskIn, fovDeg=55){
  uDiskIn = diskIn;
  const inDisk=h=>h.r>uDiskIn && h.r<R_OUT;
  let eslesen=0,eksik=0,fazla=0,escKavga=0,marsa=0,piksel=0,yakPiksel=0,yakMarsa=0;
  const rE=[],pE=[],dE=[]; const kotu=[];
  for(const camPos of [[2.2,1.15,13.2],[1.5,0.8,8.5],[4,3,20],[0.5,2.0,6.5]]){
    const fwd=norm([-camPos[0],-camPos[1],-camPos[2]]);
    const right=norm(cross(fwd,[0,1,0])); const up=cross(right,fwd);
    const aspect=1512/747, tanF=Math.tan(fovDeg*Math.PI/360);
    for(let py=0;py<56;py++) for(let px=0;px<112;px++){
      const sx=(px+0.5)/112*2-1, sy=1-(py+0.5)/56*2;
      const rd=norm([fwd[0]+right[0]*sx*tanF*aspect+up[0]*sy*tanF,
                     fwd[1]+right[1]*sx*tanF*aspect+up[1]*sy*tanF,
                     fwd[2]+right[2]*sx*tanF*aspect+up[2]*sy*tanF]);
      const r0=len(camPos), f0=Math.sqrt(Math.max(1-1/r0,1e-4)), pr=norm(camPos);
      const v=norm([rd[0]+(f0-1)*dot(rd,pr)*pr[0], rd[1]+(f0-1)*dot(rd,pr)*pr[1], rd[2]+(f0-1)*dot(rd,pr)*pr[2]]);
      const a=b3(camPos,v); if(!a) continue;
      piksel++;
      if(!a.esc) yakPiksel++;
      if(ESKI && !a.esc){ marsa++; if(!a.esc) yakMarsa++; continue; }  // B2: yakalanan marşta
      if(!a.tam){ marsa++; if(!a.esc) yakMarsa++; continue; }
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
        if(de>0.5 && kotu.length<12) kotu.push({k:ab[en].k, e2:+ab[en].e2.toFixed(5),
          phiE:+ab[en].phiE.toFixed(3), PH:+ab[en].PH.toFixed(3),
          ud:+ab[en].ud.toFixed(3),
          sgnk:ab[en].sgnk, kap:ab[en].kapakli, aps:ab[en].apsisVar,
          rTab:+ab[en].r.toFixed(3), rGer:+th.r.toFixed(3), deg:+(de*180/Math.PI).toFixed(1)});
      }
      fazla += kul.filter(x=>!x).length;
    }
  }
  console.log(`\n${etiket}  (uDiskIn=${diskIn})`);
  console.log(`  piksel ${piksel}, yakalanan ${yakPiksel}; MARŞA DÜŞEN ${marsa} (%${(100*marsa/piksel).toFixed(1)}) — bunlardan yakalanan ${yakMarsa}`);
  console.log(`  disk bandı: eşleşen ${eslesen}, EKSİK ${eksik} (%${(100*eksik/Math.max(eslesen+eksik,1)).toFixed(2)}), FAZLA ${fazla}, kaçış/yakalanma çelişkisi ${escKavga}`);
  console.log(`  yarıçap bağıl medyan ${(q(rE,.5)*100).toFixed(3)}%  p99 ${(q(rE,.99)*100).toFixed(2)}%`);
  console.log(`  konum        medyan ${q(pE,.5).toFixed(4)}  p99 ${q(pE,.99).toFixed(3)} birim`);
  console.log(`  (apsissiz DIŞA giden ışın sayacı: ${DISA_GIDEN_APSISSIZ})`);
  console.log(`  YÖN          medyan ${(q(dE,.5)*1e3).toFixed(2)} mrad  p99 ${(q(dE,.99)*1e3).toFixed(1)} mrad  MAX ${(q(dE,1)*180/Math.PI).toFixed(1)}°`);
  if(kotu.length) for(const x of kotu) console.log('   KÖTÜ', JSON.stringify(x));
}

// FOTON HALKASI TARAMASI: pikselleri değil, DOĞRUDAN e²'yi kritik değerin
// çevresinde tarar. Kapak (CAP) yalnız burada devreye girer — φ_end e² → KMU'da
// ıraksar; kaç ışının marşa düştüğü ve orada doğruluğun ne olduğu ölçülür.
function halkaTaramasi(){
  uDiskIn = 2.32;
  const inDisk=h=>h.r>uDiskIn && h.r<R_OUT;
  let n=0,marsa=0,eslesen=0,eksik=0,fazla=0; const rE=[],dE=[];
  for(const camPos of [[2.2,1.15,13.2],[1.5,0.8,8.5],[0.5,2.0,6.5]]){
    const r0=len(camPos), pr=norm(camPos), u0=1/r0;
    // ışın düzlemini disk düzlemine göre eğ: her azimutta bir yelpaze
    for(let ia=0; ia<24; ia++){
      const az = ia/24*2*Math.PI;
      // pr'ye dik iki eksen
      let e1 = norm(cross(pr, Math.abs(pr[1])<0.9?[0,1,0]:[1,0,0]));
      const e2v = cross(pr, e1);
      const w = add(mul(e1, Math.cos(az)), mul(e2v, Math.sin(az)));
      for(let j=0;j<200;j++){
        // e² = u̇² + u²(1−u), u̇ = −u/tan δ  ⇒ δ'yı kritik e²'nin çevresinde tara
        const frac = 0.90 + 0.20*j/199;                 // e²/KMU ∈ [0.90, 1.10]
        const e2t = KMU*frac;
        const ud2 = e2t - u0*u0*(1-u0); if(ud2<=0) continue;
        const udT = Math.sqrt(ud2);                      // içe giden dal
        const delta = Math.atan2(u0, -udT) < 0 ? Math.atan2(u0,-udT)+Math.PI : Math.atan2(u0,-udT);
        const v = norm(add(mul(pr, Math.cos(delta)), mul(w, Math.sin(delta))));
        const a=b3(camPos,v); if(!a) continue;
        n++;
        if(!a.tam){ marsa++; continue; }
        const t=truth(camPos,v);
        const tb=t.hits.filter(inDisk), ab=a.hits.filter(inDisk);
        const kul=new Array(ab.length).fill(false);
        for(const th of tb){
          let enD=1e9,en=-1;
          for(let m=0;m<ab.length;m++){ if(kul[m])continue;
            const dd=len([ab[m].pos[0]-th.pos[0],0,ab[m].pos[2]-th.pos[2]]); if(dd<enD){enD=dd;en=m;} }
          if(en<0||enD>1.0){ eksik++; continue; }
          kul[en]=true; eslesen++;
          rE.push(Math.abs(ab[en].r-th.r)/th.r);
          dE.push(Math.acos(clamp(dot(ab[en].dir,th.dir),-1,1)));
        }
        fazla += kul.filter(x=>!x).length;
      }
    }
  }
  console.log(`\nFOTON HALKASI TARAMASI  (e²/KMU ∈ [0.90,1.10], 3 kamera x 24 azimut x 200)`);
  console.log(`  ışın ${n}; MARŞA DÜŞEN ${marsa} (%${(100*marsa/n).toFixed(1)})`);
  console.log(`  disk bandı: eşleşen ${eslesen}, EKSİK ${eksik} (%${(100*eksik/Math.max(eslesen+eksik,1)).toFixed(2)}), FAZLA ${fazla}`);
  console.log(`  yarıçap bağıl medyan ${(q(rE,.5)*100).toFixed(3)}%  p99 ${(q(rE,.99)*100).toFixed(2)}%`);
  console.log(`  YÖN medyan ${(q(dE,.5)*1e3).toFixed(2)} mrad  p99 ${(q(dE,.99)*1e3).toFixed(1)} mrad  MAX ${(q(dE,1)*180/Math.PI).toFixed(1)}°`);
}

// DIŞA BAKAN IŞIN TARAMASI: kamera delikten UZAĞA bakıyor (serbest bakış).
// Bu, apsisi OLMAYAN (e² ≥ KMU) ve u̇ < 0 olan tek durumdur; deliğe bakan
// kadrajlarda hiç uğranmaz, o yüzden B2 doğrulamasında görünmemişti.
// Tablo eğrisi burada GERİ kat edilir (φ = φ_c − ψ); eski kod apsis
// yansıtması uyguluyordu ve apsis yoktu.
function disaBakan(){
  uDiskIn = 2.32;
  const inDisk=h=>h.r>uDiskIn && h.r<R_OUT;
  let n=0,dal=0,eslesen=0,eksik=0,fazla=0; const rE=[],dE=[];
  for(const camPos of [[7.9,0.30,0.6],[5.0,0.15,3.9],[3.2,0.10,1.0]]){
    const r0=len(camPos), pr=norm(camPos);
    for(let ia=0; ia<64; ia++){
      const az=ia/64*2*Math.PI;
      let e1=norm(cross(pr,[0,1,0])); const e2v=cross(pr,e1);
      const w=add(mul(e1,Math.cos(az)), mul(e2v,Math.sin(az)));
      for(let j=1;j<=40;j++){
        const delta=j/40*0.33;                     // dışa bakış: δ küçük
        const v=norm(add(mul(pr,Math.cos(delta)), mul(w,Math.sin(delta))));
        const u=1/r0, ud=-u/Math.tan(delta), e2=ud*ud+u*u*(1-u);
        if(e2 < KMU) continue;                     // yalnız apsissiz dal
        const a=b3(camPos,v); if(!a) continue;
        n++; if(!a.tam){ continue; }
        const t=truth(camPos,v);
        const tb=t.hits.filter(inDisk), ab=a.hits.filter(inDisk);
        if(ab.length) dal++;
        const kul=new Array(ab.length).fill(false);
        for(const th of tb){
          let enD=1e9,en=-1;
          for(let m=0;m<ab.length;m++){ if(kul[m])continue;
            const dd=len([ab[m].pos[0]-th.pos[0],0,ab[m].pos[2]-th.pos[2]]); if(dd<enD){enD=dd;en=m;} }
          if(en<0||enD>1.0){ eksik++; continue; }
          kul[en]=true; eslesen++;
          rE.push(Math.abs(ab[en].r-th.r)/th.r);
          dE.push(Math.acos(clamp(dot(ab[en].dir,th.dir),-1,1)));
        }
        fazla += kul.filter(x=>!x).length;
      }
    }
  }
  console.log(`\nDIŞA BAKAN TARAMA (apsissiz, u̇<0)  ışın ${n}, kesişim üreten ${dal}`);
  console.log(`  disk bandı: eşleşen ${eslesen}, EKSİK ${eksik}, FAZLA ${fazla}`);
  console.log(`  yarıçap bağıl medyan ${(q(rE,.5)*100).toFixed(3)}%  p99 ${(q(rE,.99)*100).toFixed(2)}%`);
  console.log(`  YÖN medyan ${(q(dE,.5)*1e3).toFixed(2)} mrad  MAX ${(q(dE,1)*180/Math.PI).toFixed(1)}°`);
}

console.log(`${ESKI?'ESKİ (B2, phi_ub)':'B3'}  U=${UW}x${UH}${ESKI?'':`  CAP=${CAP}`}`);
kosum('varsayılan disk', 2.32);
kosum('uç spin (ISCO ufka yakın)', 1.25);
halkaTaramasi();
disaBakan();
