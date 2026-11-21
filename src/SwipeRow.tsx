import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

type Side = { label: string; tone: 'ok' | 'danger' | 'neutral'; onCommit: () => void }

type Props = {
  /** Revealed and triggered when the row is dragged to the right. */
  right: Side
  /** Revealed and triggered when the row is dragged to the left. */
  left: Side
  children: ReactNode
}

const LOCK_DISTANCE = 10 // px of movement before we decide swipe vs scroll
const COMMIT_FRACTION = 0.35 // of the row width

/** A list row that can be swiped either way to trigger an action. */
export default function SwipeRow({ right, left, children }: Props) {
  const rowRef = useRef<HTMLLIElement>(null)
  const start = useRef<{ x: number; y: number; locked: boolean } | null>(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState<-1 | 0 | 1>(0)
  // How far the row must be dragged to trigger; measured when a drag starts.
  const [threshold, setThreshold] = useState(110)

  function onPointerDown(e: PointerEvent<HTMLLIElement>) {
    if (leaving || (e.pointerType === 'mouse' && e.button !== 0)) return
    start.current = { x: e.clientX, y: e.clientY, locked: false }
  }

  function onPointerMove(e: PointerEvent<HTMLLIElement>) {
    const s = start.current
    if (!s) return
    const moveX = e.clientX - s.x
    const moveY = e.clientY - s.y
    if (!s.locked) {
      if (Math.abs(moveX) < LOCK_DISTANCE && Math.abs(moveY) < LOCK_DISTANCE) return
      // Mostly vertical: it's a scroll, leave it to the browser.
      if (Math.abs(moveY) > Math.abs(moveX)) {
        start.current = null
        return
      }
      s.locked = true
      setThreshold(Math.min(140, (rowRef.current?.offsetWidth ?? 320) * COMMIT_FRACTION))
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDx(moveX)
  }

  function end() {
    const s = start.current
    start.current = null
    if (!s?.locked) return
    setDragging(false)
    if (Math.abs(dx) >= threshold) {
      const direction = dx > 0 ? 1 : -1
      setLeaving(direction)
      // Let the slide-out finish before the row disappears from the list.
      window.setTimeout(() => (direction > 0 ? right : left).onCommit(), 180)
    } else {
      setDx(0)
    }
  }

  function cancel() {
    start.current = null
    setDragging(false)
    setDx(0)
  }

  const side = dx > 0 || leaving > 0 ? right : left
  const armed = Math.abs(dx) >= threshold || leaving !== 0
  const offset = leaving ? `${leaving * 110}%` : `${dx}px`

  return (
    <li
      ref={rowRef}
      className="swipe-row"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={cancel}
    >
      {(dx !== 0 || leaving !== 0) && (
        <div
          className={`swipe-under tone-${side.tone} ${armed ? 'armed' : ''} ${
            side === right ? 'from-left' : 'from-right'
          }`}
          aria-hidden="true"
        >
          {side.label}
        </div>
      )}
      <div
        className="swipe-content"
        style={{
          transform: `translateX(${offset})`,
          transition: dragging ? 'none' : 'transform 180ms ease-out',
        }}
      >
        {children}
      </div>
    </li>
  )
}
