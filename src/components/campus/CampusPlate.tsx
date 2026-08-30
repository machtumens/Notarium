import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// The isometric campus plate from the redesign brief (option 2b).
//
// Pure CSS 3D — no WebGL, no model loader, no new dependency. The brief renders
// it exactly this way ("3D is CSS-rendered here; real models drop into the
// marked slots"):
//   perspective on the stage → a preserve-3d plate tilted rotateX(57deg)
//   rotateZ(-43deg) → wings lifted off the plate on translateZ.
// Drag changes the plate's rotateZ only, which keeps the isometric read.

export interface CampusWing {
  key: string;
  label: string;
  detail: string;
  /** Height of the slab off the plate, in px. Taller = more prominent. */
  lift: number;
  /** Two-stop translucent fill, matching the brief's acrylic look. */
  fill: [string, string];
  glow: string;
  drop: string;
  corner: 'tl' | 'tr' | 'bl' | 'br';
  locked?: boolean;
  lockedReason?: string;
  onEnter?: () => void;
}

const CORNER: Record<CampusWing['corner'], React.CSSProperties> = {
  tl: { left: 56, top: 56, width: 290, height: 250 },
  tr: { right: 56, top: 56, width: 250, height: 250 },
  bl: { left: 56, bottom: 56, width: 250, height: 230 },
  br: { right: 56, bottom: 56, width: 290, height: 230 },
};

const PLATE = 720;
const BASE_TILT = 57;
const BASE_SPIN = -43;
const MAX_SCALE = 0.66;
/** Worst-case bounding-box growth of the rotateZ'd plate (√2, at 45°). */
const SPREAD = 1.42;
/** cos(57°) — the tilt foreshortens the plate vertically. */
const TILT_COS = 0.545;
/** Pointer travel (px) past which a gesture is an orbit, not a click. */
const DRAG_SLOP = 5;

export default function CampusPlate({ wings }: { wings: CampusWing[] }) {
  const [spin, setSpin] = useState(BASE_SPIN);
  const [scale, setScale] = useState(MAX_SCALE);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; spin: number; moved: boolean } | null>(null);
  // Set on release so the click that follows a drag can be swallowed. Without
  // this, any orbit begun on a slab navigates away on mouse-up — and the slabs
  // cover most of the plate, so orbiting was effectively unusable.
  const suppressClick = useRef(false);

  // Fit the plate to its stage.
  //
  // A rotateZ'd square's VISUAL bounding box is wider than its layout box by
  // |cos θ| + |sin θ|, which peaks at √2 — and this plate sits at -43°, right at
  // that peak. Fitting against PLATE alone under-scales by ~1.41 and clips both
  // edges on a phone. SPREAD is that worst case; the vertical term also folds in
  // cos(tilt), since the 57° tilt foreshortens height.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - 24;
      const h = el.clientHeight - 24;
      const byWidth = w / (PLATE * SPREAD);
      const byHeight = h / (PLATE * SPREAD * TILT_COS);
      setScale(Math.max(0.2, Math.min(MAX_SCALE, byWidth, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { x: e.clientX, spin, moved: false };
      setDragging(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [spin],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_SLOP) return;
    d.moved = true;
    setSpin(d.spin + dx * 0.35);
  }, []);

  const endDrag = useCallback(() => {
    if (drag.current?.moved) {
      suppressClick.current = true;
      // Cleared on the next frame: the synthetic click fires immediately after
      // pointerup, so the flag only needs to outlive that one event.
      requestAnimationFrame(() => {
        suppressClick.current = false;
      });
    }
    drag.current = null;
    setDragging(false);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setSpin((s) => s - 8);
    else if (e.key === 'ArrowRight') setSpin((s) => s + 8);
    else if (e.key === 'Home') setSpin(BASE_SPIN);
    else return;
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => endDrag();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, endDrag]);

  return (
    <div
      ref={stageRef}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: '1500px',
        // `none`, not `pan-y`: the plate owns horizontal gestures, and on touch
        // `auto` let the page scroll instead of orbiting.
        touchAction: 'none',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      <div
        role="group"
        aria-label="Campus map — drag or use arrow keys to orbit, Home to recentre"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="campus-plate"
        style={{
          width: PLATE,
          height: PLATE,
          position: 'relative',
          flex: 'none',
          transformStyle: 'preserve-3d',
          transform: `rotateX(${BASE_TILT}deg) rotateZ(${spin}deg) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
          background: 'linear-gradient(160deg, rgba(255,255,255,.55), rgba(222,235,224,.4))',
          border: '1px solid rgba(255,255,255,.85)',
          boxShadow: '0 60px 120px rgba(30,64,44,.28)',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
      >
        {wings.map((w) => {
          const isHot = hovered === w.key;
          const lift = w.lift + (isHot && !w.locked ? 26 : 0);
          return (
            <div
              key={w.key}
              style={{
                position: 'absolute',
                ...CORNER[w.corner],
                transformStyle: 'preserve-3d',
                transform: `translateZ(${lift}px)`,
                transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <button
                type="button"
                // aria-disabled, not `disabled`: a disabled button is skipped by
                // keyboard and announces nothing, so the reason it is locked
                // would never reach a screen-reader user.
                aria-disabled={w.locked || undefined}
                onClick={(e) => {
                  if (suppressClick.current) {
                    e.preventDefault();
                    return;
                  }
                  if (!w.locked) w.onEnter?.();
                }}
                onMouseEnter={() => setHovered(w.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(w.key)}
                onBlur={() => setHovered(null)}
                aria-label={
                  w.locked
                    ? `${w.label} — locked. ${w.lockedReason ?? w.detail}`
                    : `${w.label} — ${w.detail}`
                }
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 6,
                  background: `linear-gradient(150deg, ${w.fill[0]}, ${w.fill[1]})`,
                  border: '1px solid rgba(255,255,255,.85)',
                  boxShadow: `26px 26px 0 ${w.drop}, 0 0 60px ${w.glow}`,
                  cursor: w.locked ? 'not-allowed' : 'pointer',
                  opacity: w.locked ? 0.5 : 1,
                  padding: 0,
                }}
              />

              {/* Billboarded label: the plate's rotation is undone so the text
                  faces the viewer instead of lying skewed on the tilted floor.
                  Without this the map is decorative — you cannot tell which
                  slab is which without reading the legend underneath. */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotateZ(${-spin}deg) rotateX(${-BASE_TILT}deg) translateZ(30px)`,
                  transition: dragging ? 'none' : 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                  width: 200,
                }}
              >
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    color: '#14251c',
                    textShadow: '0 1px 0 rgba(255,255,255,.9)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {w.label}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    fontWeight: 600,
                    color: w.locked ? '#5b6f62' : '#25402f',
                    textShadow: '0 1px 0 rgba(255,255,255,.85)',
                  }}
                >
                  {w.locked ? 'Locked' : w.detail}
                </div>
              </div>
            </div>
          );
        })}

        {/* "You are here" — honey is the you-colour throughout the system. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 352,
            top: 300,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#c99b4a',
            boxShadow: '0 0 26px 8px rgba(201,155,74,.6)',
            transform: 'translateZ(96px)',
          }}
        />
      </div>
    </div>
  );
}

export { BASE_SPIN };
