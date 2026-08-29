/**
 * Oyun POV'u: mekiğin gösterge konsolu — yalnız ekranın altında, ortası
 * yukarı çıkıntılı V siluet (yan/üst çerçeve ve cam katmanı yok). Referans:
 * yoğun mekik kokpiti — ortada kırmızı LED segman kümesi + kadranlar,
 * yanlarda camgöbeği/amber MFD ekranları, anahtar + uyarı ışığı kümeleri,
 * kenarlarda gaz kolları. Derinlik: degrade yüzeyler, alt ön-yüz bandı
 * (konsolun bize bakan kenarı), bezel gölgeleri, ekranlarda iç gölge,
 * çukur kadranlar ve cam parlamaları. Salt dekor: pointer olayı almaz,
 * DOM sırası gereği HUD'un altında kalır. viewBox 1600×600 (~16:9) —
 * gerilme tipik ekranda ihmal edilebilir, daireler daire kalır.
 */

const DEG = Math.PI / 180

/** kadran: çukur yüzey + kademe çizgileri + ibre + cam parlaması */
function Gauge({ cx, cy, needleDeg, red }: { cx: number; cy: number; needleDeg: number; red?: boolean }) {
  const ticks = [-60, -30, 0, 30, 60]
  const nx = cx + Math.sin(needleDeg * DEG) * 11
  const ny = cy - Math.cos(needleDeg * DEG) * 11
  return (
    <g>
      <circle cx={cx} cy={cy + 2} r={15} fill="rgba(0,0,0,0.5)" />
      <circle cx={cx} cy={cy} r={15} fill="#0a0e13" stroke="#3c4552" strokeWidth="2.5" />
      <path
        d={`M ${cx - 11} ${cy - 5} A 12 12 0 0 1 ${cx + 11} ${cy - 5}`}
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="3"
      />
      {ticks.map((t) => (
        <line
          key={t}
          x1={cx + Math.sin(t * DEG) * 10}
          y1={cy - Math.cos(t * DEG) * 10}
          x2={cx + Math.sin(t * DEG) * 13}
          y2={cy - Math.cos(t * DEG) * 13}
          stroke="#4a5462"
          strokeWidth="1.5"
        />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={red ? '#ff4a3a' : '#ff9a4d'} strokeWidth="2" />
      <circle cx={cx} cy={cy} r={2.5} fill="#cfd6e0" />
      <path
        d={`M ${cx - 9} ${cy - 8} A 12 12 0 0 1 ${cx + 2} ${cy - 12}`}
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="2"
      />
    </g>
  )
}

/** minik palet anahtarı (gövde + açık renk kapak) */
function Toggle({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={16} height={12} rx={2} fill="#232b36" />
      <rect x={x} y={y} width={16} height={4} rx={2} fill="#323b48" />
    </g>
  )
}

/** uyarı LED'i: parlama halkası + nokta */
function Led({ x, y, color, dim }: { x: number; y: number; color: string; dim?: boolean }) {
  return (
    <g>
      {!dim && <circle cx={x} cy={y} r={6} fill={color} opacity={0.28} />}
      <circle cx={x} cy={y} r={3} fill={color} opacity={dim ? 0.4 : 0.95} />
    </g>
  )
}

// kırmızı segman kümesi desenleri: u = sönük, r = kırmızı, a = amber
const SEG_ROW1 = ['r', 'r', 'u', 'r', 'a', 'r', 'r', 'u', 'r', 'a', 'r', 'r']
const SEG_ROW2 = ['u', 'u', 'a', 'u', 'u', 'u', 'r', 'r', 'u', 'u', 'u', 'u']
const SEG_FILL: Record<string, string> = {
  r: 'rgba(255,74,58,0.95)',
  a: 'rgba(255,167,88,0.95)',
  u: '#2b1216',
}

export function Cockpit() {
  return (
    <div className="cockpit" aria-hidden="true">
      <svg viewBox="0 0 1600 600" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ckp-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b222d" />
            <stop offset="1" stopColor="#0a0d11" />
          </linearGradient>
          <linearGradient id="ckp-trim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6a7689" />
            <stop offset="0.5" stopColor="#333c49" />
            <stop offset="1" stopColor="#1a2029" />
          </linearGradient>
          <linearGradient id="ckp-house" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#242d3a" />
            <stop offset="1" stopColor="#0c1015" />
          </linearGradient>
          <linearGradient id="ckp-bezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#303a48" />
            <stop offset="1" stopColor="#151b23" />
          </linearGradient>
          <linearGradient id="ckp-inset" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(0,0,0,0.6)" />
            <stop offset="1" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <radialGradient id="ckp-glow-red" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(255,70,50,0.2)" />
            <stop offset="1" stopColor="rgba(255,70,50,0)" />
          </radialGradient>
          <radialGradient id="ckp-glow-cyan" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(80,190,230,0.15)" />
            <stop offset="1" stopColor="rgba(80,190,230,0)" />
          </radialGradient>
          <radialGradient id="ckp-glow-amber" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(255,160,80,0.15)" />
            <stop offset="1" stopColor="rgba(255,160,80,0)" />
          </radialGradient>
          <clipPath id="ckp-clip">
            <polygon points="0,600 0,542 496,542 595,512 1005,512 1104,542 1600,542 1600,600" />
          </clipPath>
        </defs>

        {/* konsol gövdesi + köşe kararması */}
        <polygon points="0,600 0,542 496,542 595,512 1005,512 1104,542 1600,542 1600,600" fill="url(#ckp-face)" />
        <polygon points="0,542 144,542 64,600 0,600" fill="rgba(0,0,0,0.28)" />
        <polygon points="1600,542 1456,542 1536,600 1600,600" fill="rgba(0,0,0,0.28)" />

        {/* aygıt ışıklarının konsola vuran parlaması */}
        <g clipPath="url(#ckp-clip)">
          <ellipse cx="800" cy="548" rx="320" ry="46" fill="url(#ckp-glow-red)" />
          <ellipse cx="280" cy="578" rx="190" ry="40" fill="url(#ckp-glow-cyan)" />
          <ellipse cx="1320" cy="578" rx="190" ry="40" fill="url(#ckp-glow-amber)" />
        </g>

        {/* havalandırma çıtaları (ön-yüz bandından önce, kısmen gömülü) */}
        {[0, 1, 2].map((i) => (
          <line key={i} x1={10 + i * 13} y1={596} x2={48 + i * 13} y2={570} stroke="#1f252e" strokeWidth="4" />
        ))}
        {[0, 1, 2].map((i) => (
          <line key={i} x1={1590 - i * 13} y1={596} x2={1552 - i * 13} y2={570} stroke="#1f252e" strokeWidth="4" />
        ))}

        {/* alt ön-yüz bandı: konsolun bize bakan kenarı (derinlik kırılması) */}
        <polygon points="0,592 1600,592 1600,600 0,600" fill="#06080b" />
        <line x1="0" y1="592" x2="1600" y2="592" stroke="#2a323e" strokeWidth="1.5" />

        {/* üst kenar: pahlı metalik pervaz + aydınlık sırt + temas gölgesi */}
        <polygon
          points="0,542 496,542 595,512 1005,512 1104,542 1600,542 1600,552 1107,552 1011,522 589,522 493,552 0,552"
          fill="url(#ckp-trim)"
        />
        <polyline
          points="0,542 496,542 595,512 1005,512 1104,542 1600,542"
          fill="none"
          stroke="#8b98ad"
          strokeWidth="2"
        />
        <polyline
          points="0,552 493,552 589,522 1011,522 1107,552 1600,552"
          fill="none"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="1.5"
        />

        {/* orta yükselti: pahlı yan yüzler + aşağı genişleyen ön yüz (öne çıkık) */}
        <polygon points="528,600 576,522 595,522 554,600" fill="#0b0e13" />
        <polygon points="1072,600 1024,522 1005,522 1046,600" fill="#0b0e13" />
        <polygon points="554,600 595,522 1005,522 1046,600" fill="url(#ckp-house)" />
        <line x1="595" y1="523" x2="1005" y2="523" stroke="#556174" strokeWidth="1.5" />

        {/* kırmızı LED segman kümesi (çift sıra) + iç gölge + cam parlaması */}
        <rect x="643" y="532" width="314" height="34" rx="3" fill="#04060a" stroke="#262d38" />
        <rect x="645" y="533" width="310" height="8" fill="url(#ckp-inset)" />
        <ellipse cx="800" cy="549" rx="145" ry="16" fill="rgba(255,60,45,0.1)" />
        {SEG_ROW1.map((c, i) => (
          <g key={i}>
            {c !== 'u' && <rect x={653 + i * 25} y={534} width={22} height={18} rx={2} fill="rgba(255,60,45,0.25)" />}
            <rect x={656 + i * 25} y={536} width={16} height={14} rx={1} fill={SEG_FILL[c]} />
          </g>
        ))}
        {SEG_ROW2.map((c, i) => (
          <rect key={i} x={656 + i * 25} y={556} width={16} height={6} rx={1} fill={SEG_FILL[c]} opacity={c === 'u' ? 0.5 : 1} />
        ))}
        <polygon points="660,532 730,532 700,566 630,566" fill="rgba(255,255,255,0.04)" />
        <Gauge cx={688} cy={578} needleDeg={40} />
        <Gauge cx={800} cy={578} needleDeg={-25} />
        <Gauge cx={912} cy={578} needleDeg={80} red />

        {/* sol MFD: seyrüsefer ekranı (camgöbeği) — gölge + bezel + iç gölge */}
        <polygon points="125,556 435,551 445,594 112,596" fill="rgba(0,0,0,0.45)" transform="translate(0 4)" />
        <polygon points="125,552 435,547 445,590 112,592" fill="url(#ckp-bezel)" stroke="#0c1016" />
        {[
          [134, 556],
          [426, 551],
          [437, 586],
          [123, 587],
        ].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r={2.5} fill="#4a5462" />
        ))}
        <polygon points="144,559 416,554 424,586 134,589" fill="#030d14" stroke="#1d3340" />
        <polygon points="144,559 416,554 416,562 144,568" fill="url(#ckp-inset)" opacity="0.7" />
        <ellipse cx="275" cy="572" rx="70" ry="12" fill="none" stroke="rgba(87,200,234,0.7)" strokeWidth="1.5" />
        <ellipse cx="275" cy="572" rx="38" ry="6.5" fill="none" stroke="rgba(87,200,234,0.3)" />
        <circle cx="330" cy="566" r="6" fill="rgba(87,200,234,0.35)" />
        <circle cx="330" cy="566" r="3" fill="#7adcf7" />
        <line x1="275" y1="567" x2="275" y2="577" stroke="rgba(87,200,234,0.8)" />
        <line x1="269" y1="572" x2="281" y2="572" stroke="rgba(87,200,234,0.8)" />
        <line x1="365" y1="561" x2="403" y2="560" stroke="rgba(87,200,234,0.5)" strokeWidth="2" />
        <line x1="365" y1="569" x2="394" y2="568" stroke="rgba(87,200,234,0.5)" strokeWidth="2" />
        <line x1="365" y1="577" x2="400" y2="576" stroke="rgba(87,200,234,0.5)" strokeWidth="2" />
        <ellipse cx="280" cy="572" rx="135" ry="20" fill="rgba(87,200,234,0.07)" />

        {/* sağ MFD: Endurance şeması (amber) + yaklaşma vektörü */}
        <polygon points="1165,551 1475,556 1488,596 1155,594" fill="rgba(0,0,0,0.45)" transform="translate(0 4)" />
        <polygon points="1165,547 1475,552 1488,592 1155,590" fill="url(#ckp-bezel)" stroke="#0c1016" />
        {[
          [1174, 551],
          [1466, 556],
          [1477, 587],
          [1163, 586],
        ].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r={2.5} fill="#4a5462" />
        ))}
        <polygon points="1184,554 1456,559 1466,589 1176,586" fill="#030d14" stroke="#1d3340" />
        <polygon points="1184,554 1456,559 1456,567 1184,562" fill="url(#ckp-inset)" opacity="0.7" />
        {[...Array(12)].map((_, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <rect
              key={i}
              x={1320 + Math.cos(a) * 26 - 3}
              y={572 + Math.sin(a) * 9 - 1.5}
              width={6}
              height={3}
              fill="rgba(255,154,77,0.85)"
            />
          )
        })}
        <line x1="1307" y1="572" x2="1333" y2="572" stroke="rgba(255,154,77,0.6)" />
        <line x1="1320" y1="567" x2="1320" y2="577" stroke="rgba(255,154,77,0.6)" />
        <line x1="1216" y1="582" x2="1290" y2="575" stroke="rgba(87,200,234,0.6)" strokeDasharray="4 4" />
        <circle cx="1216" cy="582" r="3" fill="#7adcf7" />
        <line x1="1197" y1="562" x2="1232" y2="561" stroke="rgba(255,154,77,0.45)" strokeWidth="2" />
        <line x1="1197" y1="569" x2="1223" y2="568" stroke="rgba(255,154,77,0.45)" strokeWidth="2" />
        <ellipse cx="1320" cy="572" rx="135" ry="20" fill="rgba(255,154,77,0.06)" />

        {/* orta yükseltinin iki yanı: uyarı ışıkları + anahtar kümeleri */}
        <Led x={464} y={560} color="#78dc82" />
        <Led x={486} y={560} color="#ff4a3a" />
        <Led x={509} y={560} color="#ff4a3a" dim />
        <Led x={531} y={560} color="#ffa758" />
        {[458, 485, 512].map((x) => (
          <g key={x}>
            <Toggle x={x} y={568} />
            <Toggle x={x} y={583} />
          </g>
        ))}
        <Led x={1069} y={560} color="#ff4a3a" />
        <Led x={1091} y={560} color="#ffa758" />
        <Led x={1114} y={560} color="#78dc82" dim />
        <Led x={1136} y={560} color="#ff4a3a" dim />
        {[1062, 1090, 1117].map((x) => (
          <g key={x}>
            <Toggle x={x} y={568} />
            <Toggle x={x} y={583} />
          </g>
        ))}

        {/* kenarlar: gaz kolları */}
        {[
          { track: 38, handle: 29, hy: 566 },
          { track: 77, handle: 68, hy: 578 },
          { track: 1555, handle: 1546, hy: 570 },
          { track: 1517, handle: 1508, hy: 582 },
        ].map((l) => (
          <g key={l.track}>
            <rect x={l.track} y={556} width={8} height={34} rx={3} fill="#12161d" stroke="#232a34" />
            <rect x={l.handle} y={l.hy} width={26} height={9} rx={2} fill="#2c3542" />
            <rect x={l.handle} y={l.hy + 3} width={26} height={2} fill="rgba(255,154,77,0.8)" />
          </g>
        ))}
      </svg>
    </div>
  )
}
