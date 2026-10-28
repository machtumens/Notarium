import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * area-chart-1 / IncidentReportCard (21st.dev) pattern on the Swiss system: a title + subtitle row,
 * the summary figures, and a pure-SVG area chart. There is no palette to lean on, so the two series
 * are told apart by weight and by being named on the plot itself: "you" is the heavy ink line over a
 * fading ink area, "klas" the lighter dashed grey one. One hairline grid, no colour key.
 * No chart library — the path maths live in `chartPaths`.
 */

export type ChartSeries = { labels: string[]; you: number[]; klas: number[] };
export type ChartStat = { n: string; l: string };

type Props = {
  title: string;
  kicker?: string;
  series: ChartSeries;
  max?: number;
  stats?: ChartStat[];
  className?: string;
};

const W = 520;
const H = 190;
const PAD = 8;
const GRID_STEPS = [1, 0.75, 0.5, 0.25];

/** SVG path data for the line / area / grid, in the fixed 520×190 chart box. */
export function chartPaths(series: ChartSeries, max = 70) {
  const n = series.you.length;
  const safeMax = max > 0 ? max : 1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, n - 1);
  const y = (v: number) => H - (v / safeMax) * H;
  const line = (arr: number[]) =>
    arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const you = line(series.you);
  return {
    you,
    youArea: n ? `${you} L${x(n - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z` : '',
    klas: line(series.klas),
    labels: series.labels.map((label, i) => ({ label, x: x(i).toFixed(1) })).filter((l) => l.label),
    grid: GRID_STEPS.map((f) => ({
      y: y(safeMax * f).toFixed(1),
      label: `${Math.round(safeMax * f)}%`,
    })),
    lastX: x(Math.max(0, n - 1)).toFixed(1),
    lastY: y(series.you[n - 1] ?? 0).toFixed(1),
    // Where the comparison line ends, so its name can be set against it instead of in a legend.
    klasLastY: y(series.klas[n - 1] ?? 0).toFixed(1),
    hasData: n > 0,
  };
}

/**
 * Stat 0 is the "you" figure, stat 1 the comparison, any others plain. The ink weight here echoes
 * the weight of the matching line on the plot, which — together with the names set directly on the
 * series — is what replaces the old colour legend and its swatches.
 */
const STAT_SKIN = [
  { num: 'text-ink', label: 'text-neutral-700' },
  { num: 'text-neutral-600', label: 'text-neutral-600' },
  { num: 'text-neutral-800', label: 'text-neutral-700' },
];
const AXIS_FONT = 'Figtree, system-ui, sans-serif';

export function AreaChartCard({ title, kicker, series, max = 70, stats = [], className }: Props) {
  const gradientId = `nt-area-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const c = chartPaths(series, max);

  // Direct labelling: each series is named where it ends, so the chart needs no key. Whichever
  // series finishes lower on the page takes the label below it, the other one above.
  const youY = Number(c.lastY);
  const klasY = Number(c.klasLastY);
  const youBelow = youY >= klasY;
  const seriesLabels = [
    { text: stats[0]?.l, y: youY + (youBelow ? 17 : -9), cls: 'fill-ink', weight: 800 },
    { text: stats[1]?.l, y: klasY + (youBelow ? -9 : 17), cls: 'fill-neutral-600', weight: 700 },
  ];

  return (
    <div className={cn('border-t-2 border-ink pt-5 flex flex-col gap-5', className)}>
      <div className="flex items-end justify-between gap-5 flex-wrap">
        <div className="flex flex-col gap-1">
          <h4 className="text-[20px]">{title}</h4>
          {kicker && <span className="text-[13.5px] text-neutral-700">{kicker}</span>}
        </div>
        {stats.length > 0 && (
          <div className="flex gap-[22px] flex-wrap">
            {stats.map((s, i) => {
              const skin = STAT_SKIN[Math.min(i, STAT_SKIN.length - 1)];
              return (
                <div key={s.l} className="flex flex-col gap-0.5">
                  <span
                    data-num
                    className={cn(
                      'font-heading text-[30px] font-extrabold tracking-[-0.03em] leading-none',
                      skin.num,
                    )}
                  >
                    {s.n}
                  </span>
                  <span className={cn('text-[12px] font-bold', skin.label)}>{s.l}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <svg
          viewBox="-38 -6 566 224"
          className="w-full h-[220px] block"
          role="img"
          aria-label={`${title}: you against the class median`}
        >
          {/* One hairline grid, and the only rules inside the plot. */}
          <g className="stroke-neutral-300" strokeWidth="1">
            {c.grid.map((g) => (
              <line key={g.label} x1="0" x2={W} y1={g.y} y2={g.y} />
            ))}
          </g>
          <g
            className="fill-neutral-600"
            fontFamily={AXIS_FONT}
            fontSize="11"
            fontWeight="700"
            textAnchor="end"
          >
            {c.grid.map((g) => (
              <text key={g.label} data-num x="-10" y={g.y} dy="4">
                {g.label}
              </text>
            ))}
          </g>
          <defs>
            {/* Ink via currentColor: densest under the line, almost gone at the baseline so the grid stays readable. */}
            <linearGradient id={gradientId} className="text-ink" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {c.hasData && (
            <>
              <path d={c.youArea} fill={`url(#${gradientId})`} />
              <path
                className="stroke-neutral-500"
                d={c.klas}
                fill="none"
                strokeWidth="1.5"
                strokeDasharray="5 5"
                strokeLinecap="round"
              />
              <path
                className="stroke-ink"
                d={c.you}
                fill="none"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                className="fill-bg stroke-ink"
                cx={c.lastX}
                cy={c.lastY}
                r="5.5"
                strokeWidth="2.75"
              />
              {seriesLabels.map(
                (s) =>
                  s.text && (
                    <text
                      key={s.text}
                      className={cn('stroke-bg [paint-order:stroke]', s.cls)}
                      x={c.lastX}
                      y={s.y}
                      strokeWidth="4"
                      textAnchor="end"
                      fontFamily={AXIS_FONT}
                      fontSize="11"
                      fontWeight={s.weight}
                    >
                      {s.text}
                    </text>
                  ),
              )}
            </>
          )}
          <g
            className="fill-neutral-600"
            fontFamily={AXIS_FONT}
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
          >
            {c.labels.map((l) => (
              <text key={`${l.label}-${l.x}`} x={l.x} y="208">
                {l.label}
              </text>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
