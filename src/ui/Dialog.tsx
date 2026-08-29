import { useRef, type ReactNode } from 'react'
import { useClickAway } from 'react-use'

/**
 * Merkez dialog kabuğu: karartılmış zemin üstünde ortalanır,
 * kutunun dışına tıklanınca kapanır (react-use / useClickAway).
 */
export function Dialog({
  onClose,
  width,
  children,
}: {
  onClose: () => void
  width?: string
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  useClickAway(box, onClose)
  return (
    <div className="dialog-backdrop">
      <div className="dialog" ref={box} style={width ? { width } : undefined}>
        {children}
      </div>
    </div>
  )
}
