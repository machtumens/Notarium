// Level ring — redesign brief option 2g ("Level 7 · Field researcher · 1,240 / 1,600").
//
// Derived entirely from learning_points, so it needs no backend: there is no
// levels table, no XP column and no server-side progression. That also means the
// ring can never disagree with the ranking it sits next to — both read the same
// number.
//
// The brief's own figures (level 7 at 1,240 with 1,600 next) are illustrative
// and do not fit any clean curve, so rather than reverse-engineering a mock we
// use a flat, explainable rule: every STEP points is one level. Easy to reason
// about, easy to change in one place, and honest to describe to a student.

const STEP = 200;

const TITLES = [
  'Note taker',
  'Reader',
  'Reviser',
  'Recaller',
  'Analyst',
  'Researcher',
  'Field researcher',
  'Cartographer',
  'Archivist',
  'Scholar',
];

export function levelFor(points: number) {
  const p = Math.max(0, points || 0);
  const level = Math.floor(p / STEP) + 1;
  const floorPts = (level - 1) * STEP;
  const nextPts = level * STEP;
  return {
    level,
    title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    floorPts,
    nextPts,
    into: p - floorPts,
    toGo: nextPts - p,
    frac: (p - floorPts) / STEP,
  };
}

export default function LevelRing({ points, size = 96 }: { points: number; size?: number }) {
  const { level, title, nextPts, toGo, frac } = levelFor(points);
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(28,42,34,.10)"
            strokeWidth="7"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#b98a3f"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.min(1, Math.max(0, frac)))}
            style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            lineHeight: 1,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '.1em', color: '#3c4f43' }}>
              LVL
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1c2a22' }}>{level}</div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1c2a22' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#3c4f43', marginTop: 3 }}>
          {points.toLocaleString()} / {nextPts.toLocaleString()} learning points
        </div>
        <div style={{ fontSize: 11, color: '#8a6a22', fontWeight: 600, marginTop: 4 }}>
          {toGo} to level {level + 1}
        </div>
      </div>
    </div>
  );
}
