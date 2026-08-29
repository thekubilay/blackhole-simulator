import { useEffect, useRef } from 'react'
import { HAWKING_10MSUN as Q } from '../physics/hawking'
import { exp2 } from './format'

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

/** KUANTUM sekmesinin içeriği — dialog kabuğunu Overlay sahiplenir. */
export function QuantumPanel() {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = cv.current
    if (!c) return
    const g = c.getContext('2d')
    if (!g) return
    // 620px'lik dialogda net kalsın diye tuval genişletildi
    const W = (c.width = 560)
    const H = (c.height = 240)
    g.clearRect(0, 0, W, H)
    const px = 44
    const py = 10
    const pw = W - px - 10
    const ph = H - py - 34
    g.strokeStyle = 'rgba(255,154,77,.25)'
    g.strokeRect(px, py, pw, ph)
    g.fillStyle = '#8d7f70'
    g.font = '9px Roboto, sans-serif'
    for (const e of [-2, 0, 2, 4, 6]) {
      const x = px + ((e + 2) / 8) * pw
      g.fillText('1e' + e, x - 8, H - 20)
    }
    for (const e of [0, -75, -150, -225, -300]) {
      const y = py + (-e / 300) * ph
      g.fillText('1e' + e, 2, y + 3)
    }
    // Planck eğrisi, log10 normalize
    const kB = 1.381e-23
    const h = 6.626e-34
    const T = Q.TH
    const pts: [number, number][] = []
    let maxL = -1e9
    for (let i = 0; i <= 240; i++) {
      const le = -2 + (8 * i) / 240
      const nu = Math.pow(10, le)
      const x = (h * nu) / (kB * T)
      const lB = 3 * le - (x > 1e-6 ? (x > 50 ? x / Math.LN10 : Math.log10(Math.exp(x) - 1)) : Math.log10(x))
      pts.push([le, lB])
      if (lB > maxL) maxL = lB
    }
    g.strokeStyle = '#39e6e0'
    g.lineWidth = 1.8
    g.beginPath()
    let started = false
    for (const [le, lB] of pts) {
      const rel = lB - maxL
      if (rel < -310) continue
      const x = px + ((le + 2) / 8) * pw
      const y = py + (Math.min(-rel, 300) / 300) * ph
      if (!started) {
        g.moveTo(x, y)
        started = true
      } else g.lineTo(x, y)
    }
    g.stroke()
    const lp = Math.log10(Q.peak)
    g.setLineDash([3, 3])
    g.strokeStyle = 'rgba(232,222,210,.4)'
    g.beginPath()
    const xpk = px + ((lp + 2) / 8) * pw
    g.moveTo(xpk, py)
    g.lineTo(xpk, py + ph)
    g.stroke()
    g.setLineDash([])
  }, [])
  return (
    <>
      <Row k="UFUK ALANI" v={exp2(Q.A) + ' m²'} />
      <Row k="ENTROPİ S/k_B" v={exp2(Q.S)} />
      <Row k="T_H (Hawking)" v={exp2(Q.TH) + ' K'} />
      <Row k="T_BUHARLAŞMA" v={exp2(Q.tEv) + ' yıl'} />
      <div style={{ color: '#8d7f70', fontSize: 9, letterSpacing: '.12em', margin: '6px 0 12px' }}>
        BEKENSTEIN–HAWKING · M = 10 M☉ REFERANS
      </div>
      <div style={{ color: '#e8ded2', fontSize: 11, letterSpacing: '.12em', marginBottom: 6 }}>
        HAWKING TAYFI <span style={{ float: 'right', color: '#8d7f70' }}>T_H = {exp2(Q.TH)} K</span>
      </div>
      <canvas ref={cv} style={{ width: '100%', display: 'block' }} />
      <div style={{ color: '#8d7f70', fontSize: 9, lineHeight: 1.6, marginTop: 10, letterSpacing: '.08em' }}>
        HAWKING IŞIMASI · TEMSİLİ · TAYF: HAWKING 1974/75 · TEPE {exp2(Q.peak)} HZ
        <br />S = A c³ / 4Għ &nbsp;·&nbsp; T_H = ħc³ / 8πGMk_B &nbsp;·&nbsp; t = 5120πG²M³ / ħc⁴
      </div>
    </>
  )
}
