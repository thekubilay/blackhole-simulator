export const fmt = (x: number | null | undefined, d: number): string =>
  x == null ? '—' : Number.isFinite(x) ? x.toFixed(d) : '∞'

export const exp2 = (x: number): string => x.toExponential(2).replace('e-', 'e−')

/** ms cinsinden saat değeri: ms → s → dk → sa → gün → yıl insanlaştırması
 * (Gargantua'da tek sahne birimi ~8 dakikadır; saatler yıllara uzanır) */
export const fmtMs = (ms: number): string => {
  if (!Number.isFinite(ms)) return '∞'
  if (ms < 1000) return ms.toFixed(2) + ' ms'
  const s = ms / 1000
  if (s < 60) return s.toFixed(2) + ' s'
  const min = s / 60
  if (min < 60) return min.toFixed(1) + ' dk'
  const h = min / 60
  if (h < 24) return h.toFixed(2) + ' sa'
  const d = h / 24
  if (d < 365.25) return d.toFixed(1) + ' gün'
  return (d / 365.25).toFixed(2) + ' yıl'
}

/** büyüyebilen değerler (z, dt/dτ): 1000 üstünde bilimsel gösterim */
export const fmtBig = (x: number, d = 3): string =>
  !Number.isFinite(x) ? '∞' : x < 1000 ? x.toFixed(d) : x.toExponential(2)
