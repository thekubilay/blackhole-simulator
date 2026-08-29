import { useRef, type ReactNode } from 'react'
import { useClickAway, useKey } from 'react-use'

/**
 * Merkez dialog kabuğu: karartılmış zemin üstünde ortalanır,
 * kutunun dışına tıklanınca (useClickAway) veya Esc ile (useKey) kapanır.
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
  useKey('Escape', onClose, undefined, [onClose])
  return (
    <div className="dialog-backdrop">
      <div className="dialog" ref={box} style={width ? { width } : undefined}>
        {children}
      </div>
    </div>
  )
}
