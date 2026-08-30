import { useCallback, useMemo, useRef, useState } from 'react';

// Library map — subjects as a topographic survey.
//
// The screen is called a map, so it behaves like one instead of like a chart.
// Every subject is a landform whose ELEVATION is how many notes it holds:
// more notes → more contour rings → a taller hill. Empty subjects stay at sea
// level and are drawn as a dashed outline, so "nothing here yet" is legible
// rather than hidden.
//
// Why contours rather than bubbles: a bubble chart encodes size and stops.
// Contour lines carry the same number but also give the surface a shape you can
// read at a glance — the busy corners of the library look like high ground.
// It is all thin linework, which stays clean at any zoom and suits the frosted
// palette better than another field of filled circles.
//
// Deterministic throughout: a subject's position and its coastline wobble both
// derive from its id, so the map is identical on every visit. A map that
// reshuffles is not a map.

export interface TopoSubject {
  id: number;
  name: string;
  icon: string;
  note_count: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const RINGS_MAX = 6;

/** Cheap deterministic hash → [0,1). Same id, same terrain, forever. */
function rand(seed: number, salt: number) {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A closed, slightly irregular ring — a coastline, not a circle. */
function contourPath(cx: number, cy: number, r: number, seed: number) {
  const N = 14;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // ±11% radial wobble keeps it organic without turning into a blob.
    const wob = 0.89 + rand(seed, i) * 0.22;
    pts.push([cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob * 0.78]);
  }
  // Closed Catmull-Rom → cubic Bézier, so the coastline is smooth.
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const p3 = pts[(i + 2) % N];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
}

function layout(i: number, total: number) {
  const r = 300 * Math.sqrt((i + 0.55) / Math.max(total, 1));
  const a = i * GOLDEN;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.66 };
}

export default function SubjectTopography({
  subjects,
  mineIds,
  onOpen,
}: {
  subjects: TopoSubject[];
  mineIds: Set<number>;
  onOpen: (s: TopoSubject) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const suppressClick = useRef(false);

  const maxNotes = useMemo(
    () => Math.max(1, ...subjects.map((s) => s.note_count || 0)),
    [subjects],
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    setZoom((z) => Math.min(2.4, Math.max(0.45, z - e.deltaY * 0.0012)));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
      setDragging(true);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [pan],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    d.moved = true;
    setPan({ x: d.px + dx, y: d.py + dy });
  }, []);

  // Same guard as the campus plate: a pan that begins on a landform must not
  // open that subject when the pointer comes up.
  const endDrag = useCallback(() => {
    if (drag.current?.moved) {
      suppressClick.current = true;
      requestAnimationFrame(() => {
        suppressClick.current = false;
      });
    }
    drag.current = null;
    setDragging(false);
  }, []);

  return (
    <svg
      role="group"
      aria-label="Library map — subjects drawn as terrain, elevation is note count"
      viewBox="-420 -280 840 560"
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        display: 'block',
      }}
    >
      <defs>
        {/* Survey graticule — the faint grid that makes it read as a chart. */}
        <pattern id="lm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(28,42,34,.07)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect x="-420" y="-280" width="840" height="560" fill="url(#lm-grid)" />

      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {subjects.map((s, i) => {
          const p = layout(i, subjects.length);
          const notes = s.note_count || 0;
          // Elevation: 0 notes = sea level (1 dashed ring), otherwise 2..6 rings.
          const rings =
            notes === 0 ? 1 : 2 + Math.round((RINGS_MAX - 2) * Math.sqrt(notes / maxNotes));
          const base = 30 + rings * 7;
          const isActive = active === s.id;
          const isMine = mineIds.has(s.id);
          const stroke = isMine ? '#8a6a22' : '#2e7d52';

          return (
            <g
              key={s.id}
              tabIndex={0}
              role="button"
              aria-label={`${s.name} — ${notes} ${notes === 1 ? 'note' : 'notes'}${isMine ? ', you have notes here' : ''}`}
              onClick={() => {
                if (suppressClick.current) return;
                onOpen(s);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(s);
                }
              }}
              onMouseEnter={() => setActive(s.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.id)}
              onBlur={() => setActive(null)}
              transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              {/* Contours, outermost first. Every third is an index contour —
                  drawn heavier, the way a real survey marks them. */}
              {Array.from({ length: rings }).map((_, k) => {
                const r = base * (1 - k / (rings + 0.9));
                const isIndex = (rings - k) % 3 === 1;
                return (
                  <path
                    key={k}
                    d={contourPath(0, 0, r, s.id + k * 7)}
                    fill={k === rings - 1 ? `${stroke}22` : 'none'}
                    stroke={stroke}
                    strokeOpacity={isActive ? 0.85 : isIndex ? 0.55 : 0.3}
                    strokeWidth={isIndex ? 1.6 : 0.9}
                    strokeDasharray={notes === 0 ? '4 4' : undefined}
                    style={{ transition: 'stroke-opacity 200ms' }}
                  />
                );
              })}

              {/* Summit marker + spot height, as on an ordnance map. */}
              {notes > 0 && (
                <>
                  <circle r={isActive ? 4 : 3} fill={stroke} style={{ transition: 'r 180ms' }} />
                  <text
                    y={-11}
                    textAnchor="middle"
                    style={{
                      font: '600 9px "IBM Plex Mono", monospace',
                      fill: stroke,
                      opacity: 0.75,
                    }}
                  >
                    {notes}
                  </text>
                </>
              )}

              <text
                y={base * 0.72 + 15}
                textAnchor="middle"
                style={{
                  font: `${isActive ? 700 : 600} 12px "IBM Plex Sans", sans-serif`,
                  fill: '#1c2a22',
                  paintOrder: 'stroke',
                  stroke: 'rgba(244,248,243,.9)',
                  strokeWidth: 3,
                  strokeLinejoin: 'round',
                }}
              >
                {s.icon} {s.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
