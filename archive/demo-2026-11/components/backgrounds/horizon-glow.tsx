import { useEffect, useRef } from 'react';
import { THEMES, type BgMode, type Palette, type ThemeName } from '@/lib/themes';
import { useApp } from '@/store';

/**
 * Horizon Glow (21st.dev/community/gradients, mode "arch") + Ink Garden dither
 * (21st.dev/community/ascii, renderMode "dither"). One rAF loop is shared by every
 * mounted canvas; each canvas repaints only while on screen.
 *
 * Motion (per 21st.dev spec): ph = t*0.72, amt = 0.62; dome radius swells by
 * 1 + sin(spin*0.8)*amt*0.07, backlight by 1 + sin(spin*0.8)*amt*0.35. Every
 * modulation is exactly 0 at t = 0 so the gradient never snaps when it starts.
 * Dither: cellSize 9, contrast 158, animStyle pulse @ intensity 60, grain 30 (overlay 0.15).
 */

type Opts = { cx: number; k: number; cell?: number; mode: 'glow' | 'ink' };
type Item = {
  el: HTMLCanvasElement;
  opts: Opts;
  src?: HTMLCanvasElement;
  theme: ThemeName;
  bg: BgMode;
};

const items = new Map<HTMLCanvasElement, Item>();
let raf = 0,
  t0 = 0,
  frame = 0,
  noise: HTMLCanvasElement | null = null;

function grain() {
  if (noise) return noise;
  const n = document.createElement('canvas');
  n.width = 120;
  n.height = 120;
  const c = n.getContext('2d')!;
  const img = c.createImageData(120, 120);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.random() * 165;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  noise = n;
  return n;
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  stops: [number, string][],
) {
  if (rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The arch dome at (w,h). Motion is exactly zero at t = 0.
function dome(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, o: Opts, p: Palette) {
  const ph = t * 0.72,
    amt = 0.62,
    spin = ph;
  const dScale = (1 + Math.sin(spin * 0.8) * amt * 0.07) * o.k;
  const gScale = (1 + Math.sin(spin * 0.8) * amt * 0.35) * o.k;
  const cx = w * o.cx,
    cy = h;
  ctx.fillStyle = p.back;
  ctx.fillRect(0, 0, w, h);
  ellipse(ctx, cx, cy, w * 1.01 * dScale, h * 0.49 * dScale, [
    [0, p.a],
    [0.238, p.b],
    [0.514, p.c],
    [0.79, p.d],
    [0.91, p.fade],
  ]);
  ellipse(ctx, cx, cy, w * 0.4242 * gScale, h * 0.1862 * gScale, [
    [0, p.g1],
    [0.38, p.g2],
    [0.72, p.g3],
  ]);
  ellipse(ctx, cx, cy, w * 0.5353 * gScale, h * 0.2842 * gScale, [
    [0, p.g4],
    [0.8, p.g5],
  ]);
}

function paint(it: Item, t: number) {
  const el = it.el,
    o = it.opts,
    p = THEMES[it.theme];
  const w = el.clientWidth,
    h = el.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
  }
  const ctx = el.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  if (it.bg === 'Off') {
    ctx.fillStyle = p.back;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (it.bg === 'Dither') {
    // One source pixel per cell: the dither grid IS the raster.
    const cell = o.cell ?? 9;
    const cw = Math.max(1, Math.ceil(w / cell)),
      ch = Math.max(1, Math.ceil(h / cell));
    if (!it.src) it.src = document.createElement('canvas');
    if (it.src.width !== cw || it.src.height !== ch) {
      it.src.width = cw;
      it.src.height = ch;
    }
    const sctx = it.src.getContext('2d', { willReadFrequently: true })!;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    dome(sctx, cw, ch, t, o, p);
    const data = sctx.getImageData(0, 0, cw, ch).data;
    ctx.fillStyle = p.back;
    ctx.fillRect(0, 0, w, h);
    const half = cell / 2;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        lum = Math.min(1, Math.max(0, (lum - 0.5) * 1.58 + 0.5)); // contrast 158
        lum += Math.sin(t * 2 + (x + y) * 0.22) * 0.072; // pulse, intensity 60
        const ink = Math.min(1, Math.max(0, 1 - lum));
        const rad = half * (0.34 + ink * 0.9);
        if (rad < 0.35) continue;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(x * cell + half, y * cell + half, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    dome(ctx, w, h, t, o, p);
  }

  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat')!;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function tick(now: number) {
  const t = (now - t0) / 1000;
  const f = ++frame;
  const vh = window.innerHeight,
    vw = window.innerWidth;
  items.forEach((it) => {
    // ink is raster-heavy: repaint every 4th frame, glow every 2nd
    if (f % (it.opts.mode === 'ink' ? 4 : 2) !== 0) return;
    const r = it.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.bottom < -80 || r.top > vh + 80 || r.right < 0 || r.left > vw) return;
    try {
      paint(it, t);
    } catch {
      /* canvas gone */
    }
  });
  raf = items.size ? requestAnimationFrame(tick) : 0;
}

/** Registers a canvas with the shared loop, starting it for the first one. */
function start(it: Item) {
  items.set(it.el, it);
  if (!raf) {
    t0 = performance.now();
    frame = 0;
    raf = requestAnimationFrame(tick);
  }
}
/** Drops a canvas from the loop, stopping it with the last one. */
function stop(el: HTMLCanvasElement) {
  items.delete(el);
  if (!items.size && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}
/** The visitor's motion preference, when the browser can be asked (jsdom cannot). */
const reducedMotion = () =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

type Props = {
  /** horizontal centre of the dome, 0–1 */ cx?: number;
  /** scale of the dome */ k?: number;
  /** dither cell size in px */ cell?: number;
  mode?: 'glow' | 'ink';
  className?: string;
  style?: React.CSSProperties;
};

export function HorizonGlow({ cx = 0.5, k = 1, cell, mode = 'glow', className, style }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { theme, bgMode } = useApp();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const it: Item = { el, opts: { cx, k, cell, mode }, theme, bg: bgMode };
    // Reduced motion: one still frame at t = 0 (where every modulation is zero) and no loop. The preference
    // can change while the page is open, so it is re-read on every `change`.
    const mq = reducedMotion();
    const apply = () => {
      if (mq?.matches) {
        stop(el);
        try {
          paint(it, 0);
        } catch {
          /* canvas gone */
        }
      } else start(it);
    };
    apply();
    mq?.addEventListener('change', apply);
    return () => {
      mq?.removeEventListener('change', apply);
      stop(el);
    };
  }, [cx, k, cell, mode, theme, bgMode]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}
