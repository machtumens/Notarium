import { useNavigate } from 'react-router-dom';
import { AreaChartCard } from '@/components/ui/area-chart-card';
import { buttonVariants } from '@/components/ui/button';
import { Kicker } from '@/components/ui/kicker';
import { Pill } from '@/components/ui/pill';
import { MISTAKES, SERIES, STATE_BARS, SUBJECTS, TREE } from '@/lib/data';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

type ProgressView = 'graph' | 'tree';

/** A "card" here is content under a hairline rule, not a filled box. The loud variant opens a column. */
const CARD = 'border-t border-neutral-300 pt-4 flex flex-col';
const CARD_LOUD = 'border-t-2 border-ink pt-5 flex flex-col';
const darkBtn = buttonVariants({ variant: 'dark' });
const VIEWS: { id: ProgressView; label: string }[] = [
  { id: 'graph', label: 'Concept graph' },
  { id: 'tree', label: 'Mastery tree' },
];

/**
 * Mastery band as ink weight rather than hue: weak reads loudest (solid ink) and mastered recedes
 * to light grey. `tone()` in lib/utils still returns the old warm ramp — these bars take their fill
 * from the ink tokens instead, so the screen is grayscale regardless of when that helper is fixed.
 */
function bandFill(pct: number) {
  if (pct < 50) return 'bg-ink';
  if (pct < 70) return 'bg-neutral-600';
  return 'bg-neutral-400';
}

/**
 * The graph's three states, as ink weight and fill rather than colour: hollow = not yet seen,
 * mid-grey = mastered and settled, solid ink = shaky, so the thing needing work is the blackest
 * mark on the canvas. The legend below repeats exactly these three.
 */
const MASTERED = 'fill-neutral-500';
const SHAKY = 'fill-ink';
const UNSEEN = 'fill-neutral-200 stroke-neutral-400';
const LEGEND = [
  { label: 'Mastered', cls: 'bg-neutral-500 border-neutral-500' },
  { label: 'Shaky', cls: 'bg-ink border-ink' },
  { label: 'Not yet seen', cls: 'bg-neutral-200 border-neutral-400' },
];

// Concept graph · Stoikiometri (static geometry from the design).
const GRAPH_DASHED: [number, number, number, number][] = [
  [78, 64, 238, 46],
  [238, 46, 430, 70],
  [430, 70, 398, 196],
  [120, 226, 168, 330],
  [398, 196, 470, 296],
  [306, 302, 168, 330],
];
const GRAPH_SOLID: [number, number, number, number][] = [
  [238, 46, 258, 166],
  [258, 166, 120, 226],
  [258, 166, 398, 196],
  [258, 166, 306, 302],
  [78, 64, 120, 226],
];
const GRAPH_NODES: {
  cx: number;
  cy: number;
  r: number;
  cls: string;
  hollow?: boolean;
  label: string;
  ly: number;
  hub?: boolean;
}[] = [
  { cx: 78, cy: 64, r: 15, cls: MASTERED, label: 'Massa atom relatif', ly: 96 },
  { cx: 238, cy: 46, r: 15, cls: MASTERED, label: 'Massa molekul relatif', ly: 24 },
  { cx: 430, cy: 70, r: 15, cls: MASTERED, label: 'Persen massa', ly: 102 },
  { cx: 258, cy: 166, r: 22, cls: SHAKY, label: 'Konsep mol', ly: 205, hub: true },
  { cx: 120, cy: 226, r: 18, cls: SHAKY, label: 'Mol ↔ massa', ly: 260 },
  { cx: 398, cy: 196, r: 14, cls: UNSEEN, hollow: true, label: 'Molaritas', ly: 226 },
  { cx: 306, cy: 302, r: 14, cls: UNSEEN, hollow: true, label: 'Hukum Avogadro', ly: 330 },
  { cx: 470, cy: 296, r: 14, cls: UNSEEN, hollow: true, label: 'Konsentrasi', ly: 326 },
  { cx: 168, cy: 330, r: 14, cls: UNSEEN, hollow: true, label: 'Volume STP', ly: 360 },
];

/** Mastery-tree row styling by depth / mastery, as the design's logic derives it. */
function treeRow(n: { label: string; pct: number; depth: number }) {
  const unseen = n.pct === 0;
  return {
    fill: unseen ? 'bg-neutral-300' : bandFill(n.pct),
    pad: 14 + n.depth * 26,
    size: n.depth === 0 ? 17 : n.depth === 1 ? 15 : 14,
    weight: n.depth < 2 ? 800 : 600,
    fg: n.depth === 0 ? 'text-ink' : n.depth === 1 ? 'text-neutral-800' : 'text-neutral-700',
    pctLabel: unseen ? 'not seen' : `${n.pct}%`,
    pctFg: unseen ? 'text-neutral-600' : 'text-neutral-700',
    barW: unseen ? 3 : n.pct,
  };
}

/** Progress: you-vs-class chart, learning state, concept graph / mastery tree, mistake patterns. */
export function Progress() {
  const { progressView: view, set } = useApp();
  const nav = useNavigate();

  const practiseLeaf = () => {
    set({ practiceView: 'landing' });
    nav('/app/practice');
  };
  const startPractice = () => {
    set({ practiceView: 'question' });
    nav('/app/practice');
  };

  return (
    <div
      data-screen-label="Progress and mastery graph"
      className="flex flex-wrap gap-x-10 gap-y-8 items-start"
    >
      <AreaChartCard
        className="flex-[1_1_100%]"
        title="Kimia mastery · semester ganjil"
        kicker="Twelve weeks. The dip in November is the two quizzes under fifty."
        series={{ labels: SERIES.weeks, you: SERIES.you, klas: SERIES.klas }}
        max={70}
        stats={[
          { n: '41%', l: 'You, this week' },
          { n: '53%', l: 'Kelas 10 median' },
        ]}
      />

      <div className="flex-[1_1_290px] min-w-[min(100%,280px)] max-w-[360px] flex flex-col gap-8">
        <div className={cn(CARD, 'gap-4')}>
          <h4 className="text-[19px]">Kimia · learning state</h4>
          {STATE_BARS.map((i) => (
            <div key={i.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="text-[14px] font-semibold text-neutral-900">{i.label}</span>
                <span data-num className="text-[13px] font-bold text-neutral-700">
                  {i.pct}%
                </span>
              </div>
              <span className="block h-[7px] rounded-full bg-neutral-200 overflow-hidden">
                <span
                  className={cn('block h-[7px] rounded-full', bandFill(i.pct))}
                  style={{ width: `${i.pct}%` }}
                />
              </span>
            </div>
          ))}
          <p className="text-[13px] leading-[1.55] text-neutral-700 [text-wrap:pretty]">
            You understand the concepts. The gap is in turning them into answers under time
            pressure.
          </p>
        </div>
        <div className={cn(CARD, 'gap-3.5')}>
          <h4 className="text-[19px]">All subjects</h4>
          {SUBJECTS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => nav('/app/progress')}
              className="flex items-center gap-[11px] w-full text-left bg-transparent cursor-pointer group"
            >
              <span className="flex-1 min-w-0 text-[14px] font-semibold text-neutral-900 group-hover:text-ink">
                {s.label}
              </span>
              <span className="block w-[86px] h-1.5 rounded-full bg-neutral-200 overflow-hidden flex-[0_0_86px]">
                <span
                  className={cn('block h-1.5 rounded-full', bandFill(s.pct))}
                  style={{ width: `${s.pct}%` }}
                />
              </span>
              <span data-num className="text-[13px] font-bold text-neutral-700 w-[34px] text-right">
                {s.pct}%
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-[100_1_400px] min-w-[min(100%,340px)] flex flex-col gap-3.5">
        <div className="flex gap-[9px] flex-wrap">
          {VIEWS.map((v) => (
            <Pill
              key={v.id}
              on={view === v.id}
              onClick={() => set({ progressView: v.id })}
              className="px-[17px] py-[9px] text-[13px] font-bold"
            >
              {v.label}
            </Pill>
          ))}
        </div>

        {view === 'graph' && (
          <div className={cn(CARD_LOUD, 'gap-4')}>
            <div className="flex items-baseline justify-between gap-3.5 flex-wrap">
              <h4 className="text-[20px]">Concept graph · Stoikiometri</h4>
              <span data-num className="text-[13px] text-neutral-700">
                9 concepts · 11 links
              </span>
            </div>
            <svg
              viewBox="0 0 540 380"
              className="w-full h-auto block"
              role="img"
              aria-label="Concept graph for Stoikiometri showing mastered, shaky and unseen concepts"
            >
              <g className="stroke-neutral-400" strokeWidth="1.5" strokeDasharray="4 4">
                {GRAPH_DASHED.map(([x1, y1, x2, y2]) => (
                  <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
                ))}
              </g>
              <g className="stroke-ink" strokeWidth="2.75">
                {GRAPH_SOLID.map(([x1, y1, x2, y2]) => (
                  <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
                ))}
              </g>
              <g>
                {GRAPH_NODES.map((n) => (
                  <circle
                    key={n.label}
                    className={n.cls}
                    cx={n.cx}
                    cy={n.cy}
                    r={n.r}
                    strokeWidth={n.hollow ? 2 : undefined}
                  />
                ))}
              </g>
              <g
                className="fill-neutral-700"
                fontFamily="Figtree, system-ui, sans-serif"
                fontSize="12.5"
                fontWeight="600"
                textAnchor="middle"
              >
                {GRAPH_NODES.map((n) => (
                  <text
                    key={n.label}
                    className={n.hub ? 'fill-ink' : undefined}
                    x={n.cx}
                    y={n.ly}
                    fontSize={n.hub ? 14.5 : undefined}
                    fontWeight={n.hub ? 700 : undefined}
                  >
                    {n.label}
                  </text>
                ))}
              </g>
            </svg>
            <div className="flex gap-[18px] flex-wrap pt-1.5 border-t border-neutral-300">
              {LEGEND.map((l) => (
                <span
                  key={l.label}
                  className="flex items-center gap-2 text-[13px] font-semibold text-neutral-700"
                >
                  <span className={cn('w-3 h-3 rounded-full flex-[0_0_12px] border', l.cls)} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {view === 'tree' && (
          <div className={cn(CARD_LOUD, 'gap-3.5')}>
            <div className="flex items-baseline justify-between gap-3.5 flex-wrap">
              <h4 className="text-[20px]">Mastery tree · Kimia</h4>
              <span className="text-[13px] text-neutral-700">
                Curriculum order · click a leaf to practise it
              </span>
            </div>
            <div className="flex flex-col">
              {TREE.map((n) => {
                const r = treeRow(n);
                return (
                  <button
                    key={n.label}
                    type="button"
                    onClick={practiseLeaf}
                    className="flex items-center gap-3.5 w-full text-left bg-transparent border-l-2 border-transparent cursor-pointer hover:border-ink"
                    style={{ padding: `10px 16px 10px ${r.pad}px` }}
                  >
                    <span
                      className={cn('flex-1 min-w-0 truncate', r.fg)}
                      style={{ fontSize: r.size, fontWeight: r.weight }}
                    >
                      {n.label}
                    </span>
                    <span className="block w-[min(42%,220px)] h-2 rounded-full bg-neutral-200 overflow-hidden flex-none">
                      <span
                        className={cn('block h-2 rounded-full', r.fill)}
                        style={{ width: `${r.barW}%` }}
                      />
                    </span>
                    <span
                      data-num
                      className={cn(
                        'text-[12.5px] font-bold w-[62px] text-right flex-[0_0_62px]',
                        r.pctFg,
                      )}
                    >
                      {r.pctLabel}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] leading-[1.55] text-neutral-700 max-w-[70ch] [text-wrap:pretty]">
              The tree is the curriculum. The graph is what the questions are actually built from —
              a concept can be mastered in the tree and still be a weak link in the graph.
            </p>
          </div>
        )}
      </div>

      <div className="flex-[1_1_270px] min-w-[min(100%,260px)] max-w-[340px] flex flex-col gap-8">
        {/* The one inverted band on this screen: the mistakes are the thing to act on. */}
        <div className="bg-ink text-accent-100 p-[22px] flex flex-col gap-[13px]">
          <h4 className="text-[19px] text-accent-100">Mistake patterns</h4>
          {MISTAKES.map((i) => (
            <div key={i.n} className="flex items-baseline gap-[11px]">
              <span
                data-num
                className="font-heading text-[21px] font-extrabold text-accent-100 flex-none"
              >
                {i.n}
              </span>
              <span className="flex-1 min-w-0 text-[14px] leading-[1.45] text-accent-300">
                {i.label}
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={startPractice}
            className={cn(darkBtn, 'self-start px-[18px] py-2.5 text-[14px] mt-1')}
          >
            Drill these
          </button>
        </div>
        <div className={cn(CARD, 'gap-[9px]')}>
          <Kicker size="md" className="text-neutral-600">
            Orchestrator
          </Kicker>
          <p className="text-[14px] leading-[1.55] text-neutral-700 [text-wrap:pretty]">
            Three of your four mistakes are arithmetic, not conceptual. Practice is weighted above
            note discovery until that ratio flips.
          </p>
        </div>
      </div>
    </div>
  );
}
