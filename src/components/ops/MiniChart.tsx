import { darkTheme } from '../../theme';

export interface ChartPoint {
  t: string;
  v: number;
}

interface MiniChartProps {
  points: ChartPoint[];
  variant?: 'area' | 'bar';
  color?: string;
  height?: number;
  width?: number;
}

// Fixed viewBox, no dependencies. Renders a sparkline-style line/area chart or a
// simple bar chart from {t, v}[]. Scales to the container via width:100%.
const VB_W = 320;
const VB_H = 100;
const PAD = 6;

export default function MiniChart({
  points,
  variant = 'area',
  color = darkTheme.colors.accent,
  height = 120,
}: MiniChartProps) {
  if (!points || points.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: darkTheme.colors.textSecondary,
          fontSize: '12px',
          border: `1px dashed ${darkTheme.colors.borderColor}`,
          borderRadius: darkTheme.borderRadius.md,
          background: darkTheme.colors.bgSecondary,
        }}
      >
        No data
      </div>
    );
  }

  const values = points.map((p) => p.v);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const innerW = VB_W - PAD * 2;
  const innerH = VB_H - PAD * 2;

  const xFor = (i: number) =>
    points.length === 1 ? VB_W / 2 : PAD + (i / (points.length - 1)) * innerW;
  const yFor = (v: number) => PAD + innerH - ((v - min) / span) * innerH;

  if (variant === 'bar') {
    const slot = innerW / points.length;
    const barW = Math.max(1, slot * 0.6);
    return (
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
        role="img"
        aria-label="bar chart"
      >
        {points.map((p, i) => {
          const barH = ((p.v - min) / span) * innerH;
          const x = PAD + i * slot + (slot - barW) / 2;
          const y = PAD + innerH - barH;
          return (
            <rect key={i} x={x} y={y} width={barW} height={Math.max(0, barH)} rx={1} fill={color} />
          );
        })}
      </svg>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.v)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(points.length - 1)} ${PAD + innerH} L ${xFor(0)} ${PAD + innerH} Z`;
  const gradId = `mc-grad-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label="line chart"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
