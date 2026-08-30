import { useCallback, useEffect, useRef, useState } from 'react';

// Rotatable model slot — option 2d of the redesign brief ("3D model attached").
//
// The brief renders the model as a CSS wireframe sphere and states plainly:
// "3D is CSS-rendered here; real models drop into the marked slots." This is
// that slot. It is a real, orbitable object today (three great circles on
// rotateY 0/60/120 inside a preserve-3d stage, plus two orbiting markers) and
// the single place to mount a .glb viewer later — no other file needs to change.
//
// Deliberately no WebGL dependency: Notarium ships to Cloudflare Pages with a
// tight bundle budget, and nothing in the product supplies model files yet.

export default function ModelSlot({
  label = 'MODEL SLOT',
  filename,
  size = 180,
}: {
  label?: string;
  filename?: string;
  size?: number;
}) {
  const [spin, setSpin] = useState(-24);
  const [tilt, setTilt] = useState(-18);
  const [auto, setAuto] = useState(true);
  const [cutaway, setCutaway] = useState(false);
  const [labels, setLabels] = useState(true);
  const drag = useRef<{ x: number; y: number; s: number; t: number } | null>(null);
  const raf = useRef<number | null>(null);

  // Auto-orbit runs on rAF rather than a CSS animation so a drag can take over
  // mid-spin from the current angle instead of snapping back to the keyframe.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!auto || reduced) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setSpin((s) => s + dt * 0.02); // ~18s per revolution, matching the brief
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [auto]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, s: spin, t: tilt };
      setAuto(false);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [spin, tilt],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setSpin(drag.current.s + (e.clientX - drag.current.x) * 0.5);
    setTilt(Math.max(-70, Math.min(70, drag.current.t - (e.clientY - drag.current.y) * 0.4)));
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  const ring = (deg: number, faint = true) => ({
    position: 'absolute' as const,
    inset: 0,
    border: `1px solid rgba(46,125,82,${faint ? 0.32 : 0.5})`,
    borderRadius: '50%',
    transform: `rotateY(${deg}deg)`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label={`${label}${filename ? ` — ${filename}` : ''}. Drag to orbit.`}
        style={{
          width: size,
          height: size,
          margin: '0 auto',
          position: 'relative',
          perspective: '900px',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${tilt}deg) rotateY(${spin}deg)`,
          }}
        >
          {/* Body. Cross-section drops the fill so the interior rings read. */}
          <div
            style={{
              ...ring(0, false),
              background: cutaway
                ? 'transparent'
                : 'radial-gradient(circle at 34% 30%, rgba(255,255,255,.5), rgba(143,208,171,.18))',
              transform: 'translateZ(0)',
            }}
          />
          <div style={ring(60)} />
          <div style={ring(120)} />

          {labels && (
            <>
              <span
                style={{
                  position: 'absolute',
                  left: 22,
                  top: 46,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#c99b4a',
                  boxShadow: '0 6px 14px rgba(155,110,45,.5)',
                  transform: 'translateZ(60px)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 26,
                  bottom: 52,
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: '#4b93a6',
                  boxShadow: '0 6px 14px rgba(40,82,94,.5)',
                  transform: 'translateZ(-40px)',
                }}
              />
            </>
          )}
        </div>
      </div>

      <div
        className="mono"
        style={{
          textAlign: 'center',
          fontSize: 9.5,
          letterSpacing: '.12em',
          color: '#3c4f43',
        }}
      >
        {label}
        {filename ? ` · ${filename}` : ''}
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[
          { t: auto ? 'Pause' : 'Orbit', on: auto, go: () => setAuto((v) => !v) },
          { t: 'Cross-section', on: cutaway, go: () => setCutaway((v) => !v) },
          { t: 'Labels', on: labels, go: () => setLabels((v) => !v) },
        ].map((b) => (
          <button
            key={b.t}
            type="button"
            onClick={b.go}
            aria-pressed={b.on}
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: b.on ? 'rgba(46,125,82,.15)' : 'transparent',
              border: b.on ? '1px solid rgba(46,125,82,.32)' : '1px dashed rgba(28,42,34,.22)',
              color: b.on ? '#1f5c3e' : '#3c4f43',
            }}
          >
            {b.t}
          </button>
        ))}
      </div>
    </div>
  );
}
