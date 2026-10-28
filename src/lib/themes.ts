/**
 * 21st.dev community themes (https://21st.dev/community/themes) as Horizon-Glow palettes.
 * Vintage paper is the default; the others are "extra themes" from dev21assets.md.
 * Each palette feeds the arch gradient stops (a…d), the two backlight ellipses (g1…g5) and the parchment backdrop.
 */
export type Palette = {
  a: string;
  b: string;
  c: string;
  d: string;
  fade: string;
  g1: string;
  g2: string;
  g3: string;
  g4: string;
  g5: string;
  back: string;
};

export const THEMES = {
  'Vintage paper': {
    a: '#fc8279',
    b: '#FB6A60',
    c: '#FDA096',
    d: '#F52929',
    fade: 'rgba(245,41,41,0)',
    g1: 'rgba(252,158,152,0.367)',
    g2: 'rgba(251,106,96,0.143)',
    g3: 'rgba(251,106,96,0)',
    g4: 'rgba(253,160,150,0.133)',
    g5: 'rgba(253,160,150,0)',
    back: '#F5E5D3',
  },
  'Slate minimal': {
    a: '#7d8a97',
    b: '#5C6B7A',
    c: '#9AA7B4',
    d: '#2F3A46',
    fade: 'rgba(47,58,70,0)',
    g1: 'rgba(154,167,180,0.367)',
    g2: 'rgba(92,107,122,0.143)',
    g3: 'rgba(92,107,122,0)',
    g4: 'rgba(154,167,180,0.133)',
    g5: 'rgba(154,167,180,0)',
    back: '#F5E5D3',
  },
  'Maker clay': {
    a: '#d67f48',
    b: '#c67139',
    c: '#f0b28a',
    d: '#8c491a',
    fade: 'rgba(140,73,26,0)',
    g1: 'rgba(240,178,138,0.367)',
    g2: 'rgba(198,113,57,0.143)',
    g3: 'rgba(198,113,57,0)',
    g4: 'rgba(240,178,138,0.133)',
    g5: 'rgba(240,178,138,0)',
    back: '#F5E5D3',
  },
  'Pink vivid': {
    a: '#ef4c9b',
    b: '#F0569F',
    c: '#FBA3C8',
    d: '#E0218A',
    fade: 'rgba(224,33,138,0)',
    g1: 'rgba(251,163,200,0.367)',
    g2: 'rgba(240,86,159,0.143)',
    g3: 'rgba(240,86,159,0)',
    g4: 'rgba(251,163,200,0.133)',
    g5: 'rgba(251,163,200,0)',
    back: '#F5E5D3',
  },
  'Cobalt field': {
    a: '#3766dd',
    b: '#3E70E8',
    c: '#8FAEF5',
    d: '#1B49C4',
    fade: 'rgba(27,73,196,0)',
    g1: 'rgba(143,174,245,0.367)',
    g2: 'rgba(62,112,232,0.143)',
    g3: 'rgba(62,112,232,0)',
    g4: 'rgba(143,174,245,0.133)',
    g5: 'rgba(143,174,245,0)',
    back: '#F5E5D3',
  },
} satisfies Record<string, Palette>;

export type ThemeName = keyof typeof THEMES;
export type BgMode = 'Dither' | 'Smooth' | 'Off';
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
export const BG_MODES: BgMode[] = ['Dither', 'Smooth', 'Off'];
