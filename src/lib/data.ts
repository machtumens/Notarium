/** Static learner data from the Adaptive UX design. Swap for API calls when the backend lands. */
import type { Leader, Note, User } from '@/lib/api';
import type { Ctx } from '@/store';

export const SUBJECTS = [
  { label: 'Matematika', pct: 78 },
  { label: 'Fisika', pct: 66 },
  { label: 'Kimia', pct: 41 },
  { label: 'Biologi', pct: 81 },
  { label: 'B. Inggris', pct: 74 },
  { label: 'Sejarah', pct: 69 },
];

export const HEADS: Record<Ctx, (learner: string) => { h: string; s: string }> = {
  normal: (l) => ({
    h: `Sore, ${l}`,
    s: 'Two quizzes came back below fifty in Kimia, so it moved to the front. Everything else is where you left it.',
  }),
  exam: (l) => ({
    h: `Five days, ${l}`,
    s: 'The space is narrower on purpose. Six subjects, one week, and one topic that needs the most of it.',
  }),
  session: () => ({
    h: 'Session with Paul',
    s: 'Vektor dan resultan. The rest of Notarium is out of the way until twenty hundred.',
  }),
  break: (l) => ({
    h: `Ten minutes, ${l}`,
    s: 'One thing, small enough to finish. The streak only needs three questions.',
  }),
};

/**
 * Heads for signed-in accounts: the real name and note count only, nothing from the design's learner model.
 * Shell should pick these over HEADS when `isUser`. Session reads as normal: tutor sessions are demo-only.
 */
const accountNormal = (name: string, notes: number) => ({
  h: `Sore, ${name}`,
  s: notes
    ? `${notes} note${notes === 1 ? '' : 's'} so far. Your latest note is at the top; the community is below it.`
    : 'Nothing written yet. Your first note goes at the top.',
});
export const ACCOUNT_HEADS: Record<Ctx, (name: string, notes: number) => { h: string; s: string }> =
  {
    normal: accountNormal,
    exam: (name) => ({
      h: `Exam week, ${name}`,
      s: `Your own notes first, the community's after.`,
    }),
    session: accountNormal,
    break: (name) => ({
      h: `Ten minutes, ${name}`,
      s: 'One community note, read end to end, is enough for now.',
    }),
  };

/** Account overrides for page heads whose design copy names something accounts do not get (the Notes companion). */
export const ACCOUNT_PAGE_HEADS: Record<string, { h: string; s: string }> = {
  note: {
    h: 'Your notes',
    s: 'Everything you have written, drafts included. Pick one from the rail to read it in full.',
  },
};
export const PAGE_HEADS: Record<string, { h: string; s: string }> = {
  customize: {
    h: 'Customize your space',
    s: 'Drag order, add modules, and decide how much Notarium is allowed to rearrange on its own.',
  },
  note: {
    h: 'Stoikiometri',
    s: 'Catatan kelas, 4 Desember. The AI companion reads alongside you and only speaks when it has something specific.',
  },
  progress: {
    h: 'Your learning graph',
    s: 'Concepts, not chapters. The links are what the next question set is built from.',
  },
  discover: {
    h: 'Knowledge commons',
    s: 'Notes published by kelas 10 across every school on Notarium. Upvotes decide what surfaces.',
  },
  practice: {
    h: 'Practice',
    s: 'Twelve questions, assembled from the four you got wrong on Tuesday.',
  },
  tutors: {
    h: 'Tutor board',
    s: 'Peer tutors from your own school, ranked against the topics your learning state says are weakest. Availability is live.',
  },
  session: {
    h: 'Paul · Vektor',
    s: 'One session, three phases. The diagnostic goes to the tutor before, the feedback comes back into mastery after.',
  },
  ai: {
    h: 'Notarium AI',
    s: 'The tutor that has read every note you wrote and every question you missed.',
  },
  create: {
    h: 'Create',
    s: 'Write it for yourself first. Publishing is a second, separate decision.',
  },
};

// ── Adaptive canvas modules ───────────────────────────────────────────────────
export type Module =
  | {
      k: 'hero';
      span: number;
      kicker: string;
      title: string;
      body: string;
      cta: string;
      meta: string[];
      act: string;
    }
  | {
      k: 'countdown';
      span: number;
      big: string;
      title: string;
      sub: string;
      cta: string;
      act: string;
    }
  | {
      k: 'bars';
      span: number;
      title: string;
      note: string;
      items: { label: string; pct: number }[];
    }
  | {
      k: 'list';
      span: number;
      title: string;
      badge: string;
      cta: string;
      act?: string;
      items: { label: string; meta: string; id?: number; act?: string }[];
    }
  | { k: 'stat'; span: number; title: string; body: string; stats: { n: string; l: string }[] }
  | { k: 'tutor'; span: number; timer: string; title: string; sub: string }
  | { k: 'panel'; span: number; title: string; body: string; cta: string; act?: string }
  | { k: 'note'; span: number; title: string; body: string };

/** act = route name the module's CTA goes to ('practice:question' opens the drill directly); no act = the CTA is a deliberate no-op, as in the design. */
export function modulesFor(ctx: Ctx): Module[] {
  if (ctx === 'exam')
    return [
      {
        k: 'countdown',
        span: 12,
        big: '5',
        title: 'days until Sumatif Akhir Semester',
        sub: '8–12 Desember · 6 mata pelajaran · kelas 10',
        cta: 'See the plan',
        act: 'progress',
      },
      {
        k: 'hero',
        span: 8,
        kicker: 'Highest value in the next hour',
        title: 'Stoikiometri drill — 20 questions',
        body: 'Problem solving is the weakest signal in Kimia: 54% against 82% on the concepts themselves. Nothing else you could do today moves the grade as much.',
        cta: 'Start drill',
        meta: ['22 min', 'Kimia · Stoikiometri', '+120 XP'],
        act: 'practice:question',
      },
      {
        k: 'note',
        span: 4,
        title: 'Why the space changed',
        body: 'Exam mode switched itself on five days out. Discover, Community and Study groups are paused until 12 Desember.',
      },
      {
        k: 'bars',
        span: 6,
        title: 'Weak topics',
        note: 'lowest first',
        items: [
          { label: 'Stoikiometri · Kimia', pct: 41 },
          { label: 'Vektor · Fisika', pct: 58 },
          { label: 'Trigonometri · Matematika', pct: 63 },
          { label: 'Klasifikasi · Biologi', pct: 66 },
        ],
      },
      {
        k: 'list',
        span: 6,
        title: 'Past papers',
        badge: '12 available',
        cta: 'Open all',
        act: 'practice',
        items: [
          { label: 'SAS Ganjil 2024 · Kimia', meta: 'not started' },
          { label: 'SAS Ganjil 2023 · Kimia', meta: '62%' },
          { label: 'SAS Ganjil 2024 · Fisika', meta: 'not started' },
          { label: 'SAS Ganjil 2023 · Matematika', meta: '71%' },
        ],
      },
      {
        k: 'list',
        span: 4,
        title: 'AI revision plan',
        badge: '5 days',
        cta: 'See the week',
        act: 'progress',
        items: [
          { label: 'Hari ini · Stoikiometri', meta: '2 blocks' },
          { label: 'Besok · Vektor', meta: '1 block' },
          { label: 'Rabu · Trigonometri', meta: '1 block' },
          { label: 'Kamis · mixed paper', meta: '2 blocks' },
        ],
      },
      {
        k: 'list',
        span: 4,
        title: 'Revision queue',
        badge: '34 due',
        cta: 'Review now',
        act: 'practice',
        items: [
          { label: 'Konsep mol', meta: '8 cards' },
          { label: 'Hukum Newton', meta: '11 cards' },
          { label: 'Virus & bakteri', meta: '9 cards' },
          { label: 'Kerajaan Hindu-Buddha', meta: '6 cards' },
        ],
      },
      {
        k: 'stat',
        span: 4,
        title: 'This week',
        body: 'Streak survived two exam weeks already.',
        stats: [
          { n: '12', l: 'day streak' },
          { n: '2,480', l: 'XP' },
          { n: '#7', l: 'in kelas 10' },
        ],
      },
      {
        k: 'note',
        span: 12,
        title: 'Paused for exam week',
        body: 'Discover · Community notes · Study groups · Leaderboard. All four come back on 12 Desember, in the position you left them.',
      },
    ];
  if (ctx === 'session')
    return [
      { k: 'tutor', span: 5, timer: '24:10', title: 'Paul', sub: 'Fisika · vektor dan resultan' },
      {
        k: 'panel',
        span: 4,
        title: 'Whiteboard',
        body: 'Three sketches so far: resultan dua vektor, penguraian komponen, and the diagram for soal 12.',
        cta: 'Open whiteboard',
      },
      {
        k: 'list',
        span: 3,
        title: 'Session goals',
        badge: '1 of 3',
        cta: 'Edit goals',
        items: [
          { label: 'Resultan dua vektor', meta: 'done' },
          { label: 'Penguraian komponen', meta: 'now' },
          { label: 'Soal 12 latihan', meta: 'queued' },
        ],
      },
      {
        k: 'list',
        span: 6,
        title: 'Shared notes',
        badge: 'live',
        cta: 'Open note',
        act: 'notes',
        items: [
          { label: 'Vektor — catatan sesi', meta: 'you + Paul' },
          { label: 'Rumus resultan', meta: 'pinned' },
          { label: 'Soal 12 · pembahasan', meta: '2 min ago' },
        ],
      },
      {
        k: 'panel',
        span: 3,
        title: 'AI assistant',
        body: 'Listening. I will write the summary and three practice questions when the session ends.',
        cta: 'Stay quiet',
      },
      {
        k: 'note',
        span: 3,
        title: 'Session mode',
        body: 'Everything else is hidden until 20:00. Your normal space comes back untouched.',
      },
    ];
  if (ctx === 'break')
    return [
      {
        k: 'hero',
        span: 7,
        kicker: 'Ten minutes',
        title: '3 questions · Stoikiometri',
        body: 'Short enough to actually finish. All three come from the concept you missed on Tuesday, and the first one is a gift.',
        cta: 'Start · 5 min',
        meta: ['5 min', '+40 XP'],
        act: 'practice:question',
      },
      {
        k: 'stat',
        span: 5,
        title: 'Keep it alive',
        body: 'Three questions is enough to hold the streak.',
        stats: [
          { n: '12', l: 'day streak' },
          { n: '2,480', l: 'XP' },
        ],
      },
      {
        k: 'list',
        span: 4,
        title: 'Revision queue',
        badge: '4 due',
        cta: 'Review 4',
        act: 'practice',
        items: [
          { label: 'Konsep mol', meta: '2 cards' },
          { label: 'Vektor satuan', meta: '2 cards' },
        ],
      },
      {
        k: 'note',
        span: 8,
        title: 'Why so little',
        body: 'You said ten minutes, so nothing else loaded. Notes, Discover and the mastery graph are one tap away if you change your mind.',
      },
    ];
  return [
    {
      k: 'hero',
      span: 8,
      kicker: 'Your next best action',
      title: 'Finish the Stoikiometri note — 3 sections left',
      body: 'You opened it twice this week and stopped at Konsep Mol both times. Reading it through should take about twelve minutes, and it unblocks four questions in your practice queue.',
      cta: 'Continue note',
      meta: ['12 min', 'Kimia · Stoikiometri'],
      act: 'notes',
    },
    {
      k: 'stat',
      span: 4,
      title: 'This week',
      body: 'Rank moved up two places after Nadia upvoted your Vektor note.',
      stats: [
        { n: '12', l: 'day streak' },
        { n: '2,480', l: 'XP' },
        { n: '#7', l: 'in kelas 10' },
      ],
    },
    { k: 'bars', span: 5, title: 'Mastery this week', note: 'six subjects', items: SUBJECTS },
    {
      k: 'list',
      span: 4,
      title: 'Your notes',
      badge: '24 new',
      cta: 'Open notes',
      act: 'notes',
      items: [
        { label: 'Vektor — catatan kelas', meta: '2 hari lalu' },
        { label: 'Stoikiometri — Konsep Mol', meta: 'draft' },
        { label: 'Virus & bakteri', meta: '4 hari lalu' },
        { label: 'Fungsi kuadrat', meta: 'minggu lalu' },
      ],
    },
    {
      k: 'list',
      span: 3,
      title: 'Practice queue',
      badge: '3 ready',
      cta: 'Practice',
      act: 'practice',
      items: [
        { label: 'Konsep mol', meta: '4 soal' },
        { label: 'Vektor satuan', meta: '6 soal' },
        { label: 'Trigonometri', meta: '8 soal' },
      ],
    },
    {
      k: 'list',
      span: 5,
      title: 'Community notes',
      badge: 'trending',
      cta: 'Open Discover',
      act: 'discover',
      items: [
        { label: 'Stoikiometri: 40 soal + pembahasan', meta: '388 saves' },
        { label: 'Vektor & resultan — lengkap', meta: '412 saves' },
        { label: 'Klasifikasi makhluk hidup', meta: '301 saves' },
      ],
    },
    {
      k: 'list',
      span: 4,
      title: 'Revision queue',
      badge: '12 due',
      cta: 'Review 12',
      act: 'practice',
      items: [
        { label: 'Konsep mol', meta: '4 cards' },
        { label: 'Hukum Newton', meta: '5 cards' },
        { label: 'Narrative text', meta: '3 cards' },
      ],
    },
    {
      k: 'note',
      span: 3,
      title: 'Why this moved',
      body: 'Kimia rose above Biologi after two quizzes under 50%. Nothing was removed.',
    },
    {
      k: 'list',
      span: 6,
      title: 'This week at school',
      badge: 'kelas 10',
      cta: 'Open calendar',
      items: [
        { label: 'Ulangan Fisika · Rabu', meta: '07:30' },
        { label: 'Tugas Sejarah · Kamis', meta: 'submit' },
        { label: 'Sesi Paul · Jumat', meta: '19:00' },
      ],
    },
    {
      k: 'list',
      span: 6,
      title: 'Study groups',
      badge: '2 active',
      cta: 'Join a room',
      act: 'discover',
      items: [
        { label: 'Kimia — mol & konsentrasi', meta: '6 online' },
        { label: 'Fisika — vektor', meta: '3 online' },
      ],
    },
  ];
}

/** A canvas slot: a module, or a same-span stand-in while an account's live data is pending or failed. */
export type Slot =
  | Module
  | { k: 'pending'; span: number }
  | { k: 'failed'; span: number; label: string };
type Fetched<T> = { data: T | null; error: string | null };

/** Opens one live note in the viewer — the same ?note=&subject= shape Discover uses. */
const noteAct = (n: Note) => `notes?note=${n.id}&subject=${n.subject_id}`;
const noteStatus = (n: Note) => (n.status === 'draft' ? 'draft' : 'published');
const noteDate = (n: Note) => n.created_at.slice(0, 10);

/** Live module set for a signed-in account: their notes, the commons, their standing — nothing from the learner model above, and no AI panel (main has no chat routes). */
export function accountModulesFor(
  user: User,
  mine: Fetched<Note[]>,
  commons: Fetched<Note[]>,
  leaders: Fetched<Leader[]>,
): Slot[] {
  const standIn = (q: Fetched<unknown>, span: number, label: string): Slot | null =>
    q.error ? { k: 'failed', span, label } : q.data ? null : { k: 'pending', span };
  // my-notes comes back grouped by subject, so sort by date to find the latest note; main's created_at is whole seconds, so ties go to the newer row (higher id).
  const own = [...(mine.data ?? [])].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
  );
  const latest = own[0];
  const rank = leaders.data ? leaders.data.findIndex((l) => l.display_name === user.name) + 1 : 0;
  return [
    standIn(mine, 8, 'Your latest note') ??
      (latest
        ? {
            k: 'hero',
            span: 8,
            kicker: 'Pick up where you left off',
            title: `Continue ${latest.title}`,
            body: `${latest.subject_name ?? 'No subject'} · ${noteStatus(latest)} · updated ${noteDate(latest)}`,
            cta: 'Open note',
            meta: [],
            act: noteAct(latest),
          }
        : {
            k: 'hero',
            span: 8,
            kicker: 'Nothing here yet',
            title: 'Write your first note',
            body: 'Notes you write stay yours until you choose to publish.',
            cta: 'Start writing',
            meta: [],
            act: 'create',
          }),
    standIn(mine, 4, 'Your notes') ?? {
      k: 'list',
      span: 4,
      title: 'Your notes',
      badge: `${own.length} total`,
      cta: own.length ? 'Open notes' : 'Write one',
      act: own.length ? 'notes' : 'create',
      items: own.length
        ? own
            .slice(0, 5)
            .map((n) => ({
              id: n.id,
              label: n.title,
              meta: `${noteStatus(n)} · ${noteDate(n)}`,
              act: noteAct(n),
            }))
        : [{ label: 'No notes yet', meta: '', act: 'create' }],
    },
    standIn(commons, 5, 'Community notes') ?? {
      k: 'list',
      span: 5,
      title: 'Community notes',
      badge: 'top liked',
      cta: 'Explore',
      act: 'discover',
      items: commons.data?.length
        ? commons.data.map((n) => ({
            id: n.id,
            label: n.title,
            meta: `${n.subject_name ?? 'Notes'} · ${(n.likes ?? 0) + (n.admin_upvotes ?? 0)} likes`,
            act: noteAct(n),
          }))
        : [{ label: 'Nothing published yet — be the first', meta: '', act: 'create' }],
    },
    {
      k: 'stat',
      span: 4,
      title: 'Your standing',
      body: leaders.error
        ? 'Could not load the leaderboard.'
        : rank
          ? `Ranked #${rank} of ${leaders.data?.length ?? 0} on the Notarium leaderboard.`
          : 'Publishing notes and earning likes puts you on the leaderboard.',
      stats: [
        { n: String(user.notes_count ?? 0), l: 'notes' },
        { n: String(user.total_likes ?? 0), l: 'likes' },
        { n: rank ? `#${rank}` : '—', l: 'on the board' },
      ],
    },
  ];
}

// ── Tutors ────────────────────────────────────────────────────────────────────
export type Tutor = {
  name: string;
  initials: string;
  role: 'Teaching assistant' | 'Peer tutor';
  subjects: string[];
  subject: string;
  rating: string;
  sessions: string;
  match: number;
  why: string;
  slots: string[];
  tone: string;
};
export const TUTORS: Tutor[] = [
  {
    name: 'Paul',
    initials: 'PA',
    role: 'Teaching assistant',
    subjects: ['Fisika'],
    subject: 'Fisika · vektor, penguraian komponen',
    rating: '4.9',
    sessions: '84 sesi',
    match: 96,
    why: 'Fisika TA for kelas 10. Penguraian komponen sits at 44% and it is the step he drills in every clinic.',
    slots: ['Hari ini 16:00', '17:00', '19:00'],
    tone: '#8c491a',
  },
  {
    name: 'Rosmyas',
    initials: 'RO',
    role: 'Teaching assistant',
    subjects: ['Fisika'],
    subject: 'Fisika · gerak lurus, resultan',
    rating: '4.8',
    sessions: '61 sesi',
    match: 91,
    why: 'The other Fisika TA. Keeps the worked solutions for the SAS paper from last year, and has 20:00 open tonight.',
    slots: ['Hari ini 20:00'],
    tone: '#8c491a',
  },
  {
    name: 'Petris',
    initials: 'PE',
    role: 'Peer tutor',
    subjects: ['Fisika', 'Filsafat'],
    subject: 'Fisika, Filsafat · vektor, logika',
    rating: '4.7',
    sessions: '22 sesi',
    match: 84,
    why: 'Kelas 11. Answered your rotated-axis question in the commons thread on Tuesday — the same slip the diagnostic found.',
    slots: ['Hari ini 18:30'],
    tone: '#56633f',
  },
  {
    name: 'Nadine',
    initials: 'ND',
    role: 'Peer tutor',
    subjects: ['Fisika', 'Matematika'],
    subject: 'Fisika, Matematika · trigonometri',
    rating: '4.8',
    sessions: '35 sesi',
    match: 79,
    why: 'Covers Fisika and Matematika, so trigonometri and vektor can go in one session instead of two.',
    slots: ['Besok 15:30', 'Besok 18:00'],
    tone: '#56633f',
  },
  {
    name: 'Lisa',
    initials: 'LI',
    role: 'Peer tutor',
    subjects: ['Matematika', 'Sejarah Indonesia'],
    subject: 'Matematika, Sejarah Indonesia',
    rating: '4.9',
    sessions: '48 sesi',
    match: 74,
    why: 'Her fungsi kuadrat note is the most saved one in your year, and she takes the Sejarah Indonesia essay questions nobody else does.',
    slots: ['Hari ini 21:00'],
    tone: '#56633f',
  },
  {
    name: 'Richard',
    initials: 'RI',
    role: 'Peer tutor',
    subjects: ['Matematika', 'Filsafat', 'Sejarah Indonesia'],
    subject: 'Matematika, Filsafat, Sejarah Indonesia',
    rating: '4.6',
    sessions: '19 sesi',
    match: 68,
    why: 'Three subjects, two of them essay-heavy. The only tutor on the board who covers argument structure.',
    slots: ['Besok 16:00', 'Kamis 19:00'],
    tone: '#56633f',
  },
  {
    name: 'Jennifer',
    initials: 'JE',
    role: 'Peer tutor',
    subjects: ['Geografi', 'Matematika', 'Sejarah Indonesia'],
    subject: 'Geografi, Matematika, Sejarah Indonesia',
    rating: '4.7',
    sessions: '27 sesi',
    match: 57,
    why: 'The only Geografi tutor here. Geografi is at 78%, so the board ranks her low for you tonight — that is the ranking working, not a verdict on her.',
    slots: ['Kamis 16:00'],
    tone: '#56633f',
  },
  {
    name: 'Nathania',
    initials: 'NT',
    role: 'Peer tutor',
    subjects: [],
    subject: 'Subject not set',
    rating: '—',
    sessions: 'belum ada sesi',
    match: 0,
    why: 'Signed up to tutor but has not picked a subject yet, so nothing is bookable. She is the sixth subject waiting to exist.',
    slots: [],
    tone: '#a19786',
  },
];
export const TUTOR_FILTERS = [
  'Matched to me',
  'Fisika',
  'Matematika',
  'Sejarah Indonesia',
  'Filsafat',
  'Geografi',
  'Tonight',
];
export function tutorsFiltered(f: string) {
  if (f === 'Tonight') return TUTORS.filter((t) => t.slots.some((s) => s.startsWith('Hari ini')));
  if (f === 'Matched to me' || !f) return TUTORS;
  return TUTORS.filter((t) => t.subjects.includes(f));
}
export const tutorByName = (name: string): Tutor =>
  TUTORS.find((t) => t.name === name) ?? {
    name,
    initials: name.slice(0, 2).toUpperCase(),
    role: 'Peer tutor',
    subjects: [],
    subject: '',
    rating: '—',
    sessions: '',
    match: 0,
    why: '',
    slots: [],
    tone: '#56633f',
  };

export const COVERAGE = [
  { name: 'Fisika', people: ['Paul', 'Rosmyas', 'Petris', 'Nadine'] },
  { name: 'Matematika', people: ['Lisa', 'Richard', 'Jennifer', 'Nadine'] },
  { name: 'Sejarah Indonesia', people: ['Lisa', 'Richard', 'Jennifer'] },
  { name: 'Filsafat', people: ['Richard', 'Petris'] },
  { name: 'Geografi', people: ['Jennifer'] },
  {
    name: 'Subject six',
    people: [] as string[],
    note: 'Nathania is signed up here — subject not set',
  },
];

export type EventKind = 'school' | 'task' | 'booked' | 'open' | 'exam' | 'group';
export type CalEvent = { kind: EventKind; label: string; meta: string; who?: string; id?: string };
export const WEEK_PLAN: {
  label: string;
  days: { day: string; date: string; today?: boolean; events: CalEvent[] }[];
}[] = [
  {
    label: '8–14 Desember',
    days: [
      {
        day: 'Sen',
        date: '8',
        today: true,
        events: [
          { kind: 'school', label: 'Sekolah', meta: '07:00–14:00' },
          { kind: 'task', label: 'Tugas Sejarah Indonesia', meta: 'due 23:59' },
          { kind: 'booked', label: 'Lisa · Matematika', meta: '19:00 · 60 min' },
        ],
      },
      {
        day: 'Sel',
        date: '9',
        events: [
          { kind: 'school', label: 'Sekolah', meta: '07:00–14:00' },
          {
            kind: 'open',
            who: 'Paul',
            label: 'Paul · klinik Fisika',
            meta: '16:00',
            id: 'w0-sel-16',
          },
          { kind: 'open', who: 'Petris', label: 'Petris', meta: '18:30', id: 'w0-sel-1830' },
        ],
      },
      {
        day: 'Rab',
        date: '10',
        events: [
          { kind: 'exam', label: 'Ulangan Fisika', meta: '07:30 · vektor' },
          { kind: 'school', label: 'Sekolah', meta: 'until 14:00' },
          { kind: 'open', who: 'Paul', label: 'Paul', meta: '19:00', id: 'w0-rab-19' },
        ],
      },
      {
        day: 'Kam',
        date: '11',
        events: [
          { kind: 'school', label: 'Sekolah', meta: '07:00–14:00' },
          { kind: 'task', label: 'Laporan praktikum Fisika', meta: 'due 17:00' },
          { kind: 'open', who: 'Nadine', label: 'Nadine', meta: '15:30', id: 'w0-kam-1530' },
        ],
      },
      {
        day: 'Jum',
        date: '12',
        events: [
          { kind: 'school', label: 'Sekolah', meta: '07:00–11:30' },
          { kind: 'booked', label: 'Paul · Vektor', meta: '19:00 · 60 min' },
        ],
      },
      {
        day: 'Sab',
        date: '13',
        events: [
          { kind: 'exam', label: 'SAS · Kimia', meta: '08:00' },
          { kind: 'open', who: 'Rosmyas', label: 'Rosmyas', meta: '16:00', id: 'w0-sab-16' },
        ],
      },
      {
        day: 'Min',
        date: '14',
        events: [
          {
            kind: 'group',
            label: 'Kelompok Fisika',
            meta: '16:00 · 4 peers',
            id: 'w0-min-16',
            who: 'Petris',
          },
          { kind: 'open', who: 'Lisa', label: 'Lisa', meta: '10:00', id: 'w0-min-10' },
        ],
      },
    ],
  },
  {
    label: '15–21 Desember',
    days: [
      {
        day: 'Sen',
        date: '15',
        events: [
          { kind: 'exam', label: 'SAS · Fisika', meta: '08:00' },
          { kind: 'open', who: 'Paul', label: 'Paul · review', meta: '16:00', id: 'w1-sen-16' },
        ],
      },
      {
        day: 'Sel',
        date: '16',
        events: [
          { kind: 'exam', label: 'SAS · Matematika', meta: '08:00' },
          { kind: 'open', who: 'Nadine', label: 'Nadine', meta: '16:00', id: 'w1-sel-16' },
        ],
      },
      {
        day: 'Rab',
        date: '17',
        events: [
          { kind: 'exam', label: 'SAS · Sejarah Indonesia', meta: '08:00' },
          { kind: 'open', who: 'Richard', label: 'Richard', meta: '16:00', id: 'w1-rab-16' },
        ],
      },
      {
        day: 'Kam',
        date: '18',
        events: [
          { kind: 'exam', label: 'SAS · Geografi', meta: '08:00' },
          { kind: 'open', who: 'Jennifer', label: 'Jennifer', meta: '16:00', id: 'w1-kam-16' },
        ],
      },
      {
        day: 'Jum',
        date: '19',
        events: [{ kind: 'exam', label: 'SAS · Filsafat', meta: '08:00' }],
      },
      { day: 'Sab', date: '20', events: [] },
      { day: 'Min', date: '21', events: [] },
    ],
  },
];

/** Per-kind styling for calendar chips and the availability board. */
export const EVENT_SKIN: Record<
  EventKind,
  { bg: string; bd: string; fg: string; kicker: string; dashed?: boolean; clickable?: boolean }
> = {
  exam: { bg: '#643312', bd: '#643312', fg: '#ffe1d0', kicker: 'Ujian' },
  school: { bg: '#eee7db', bd: '#dcd3c4', fg: '#474238', kicker: 'Sekolah' },
  task: { bg: 'transparent', bd: '#7a8a5e', fg: '#3d472b', kicker: 'Tugas', dashed: true },
  booked: { bg: '#ffe1d0', bd: '#c67139', fg: '#8c491a', kicker: 'Sesi', clickable: true },
  open: { bg: '#f0fae1', bd: '#ccdbb2', fg: '#3d472b', kicker: 'Slot terbuka', clickable: true },
  group: {
    bg: '#f0fae1',
    bd: '#7a8a5e',
    fg: '#3d472b',
    kicker: 'Kelompok belajar',
    clickable: true,
  },
};

export const EXAMS = [
  {
    label: 'Ulangan Fisika',
    when: 'Rabu 10 Des · 07:30',
    topic: 'Vektor & resultan · prep 44%',
    in: '2 hari',
    urgent: true,
  },
  {
    label: 'SAS · Kimia',
    when: 'Sabtu 13 Des · 08:00',
    topic: 'Stoikiometri · prep 41%',
    in: '5 hari',
    urgent: true,
  },
  {
    label: 'SAS · Fisika',
    when: 'Senin 15 Des · 08:00',
    topic: 'Seluruh semester',
    in: '7 hari',
    urgent: false,
  },
  {
    label: 'SAS · Matematika',
    when: 'Selasa 16 Des · 08:00',
    topic: 'Trigonometri, fungsi kuadrat',
    in: '8 hari',
    urgent: false,
  },
];
export const TASKS = [
  { label: 'Tugas Sejarah Indonesia', when: 'Senin 8 Des · 23:59', in: 'hari ini', urgent: true },
  { label: 'Laporan praktikum Fisika', when: 'Kamis 11 Des · 17:00', in: '3 hari', urgent: false },
  { label: 'Esai Filsafat — argumen', when: 'Senin 15 Des · 08:00', in: '7 hari', urgent: false },
];

// ── Progress ──────────────────────────────────────────────────────────────────
export const SERIES = {
  weeks: ['Sep', '', '', 'Okt', '', '', 'Nov', '', '', 'Des', '', ''],
  you: [22, 26, 24, 31, 38, 35, 44, 41, 39, 47, 52, 41],
  klas: [30, 32, 33, 36, 38, 40, 43, 45, 46, 49, 51, 53],
};
export const TREE = [
  { label: 'Kimia', pct: 41, depth: 0 },
  { label: 'Stoikiometri', pct: 41, depth: 1 },
  { label: 'Massa atom relatif', pct: 88, depth: 2 },
  { label: 'Massa molekul relatif', pct: 84, depth: 2 },
  { label: 'Konsep mol', pct: 52, depth: 2 },
  { label: 'Mol ↔ massa', pct: 47, depth: 3 },
  { label: 'Mol ↔ volume (STP)', pct: 0, depth: 3 },
  { label: 'Molaritas', pct: 0, depth: 2 },
  { label: 'Termokimia', pct: 34, depth: 1 },
  { label: 'Laju reaksi', pct: 0, depth: 1 },
];
export const STATE_BARS = [
  { label: 'Conceptual understanding', pct: 82 },
  { label: 'Problem solving', pct: 54 },
  { label: 'Confidence', pct: 67 },
];
export const MISTAKES = [
  { n: '7×', label: 'Unit conversion — gram to kilogram before dividing' },
  { n: '5×', label: 'Dropped Mr out of the formula entirely' },
  { n: '4×', label: 'Rounded at the first step instead of the last' },
];

// ── Discover ──────────────────────────────────────────────────────────────────
export const COMMONS = [
  {
    subject: 'Fisika',
    title: 'Vektor & resultan — catatan lengkap kelas 10',
    author: 'Nadia P. · SMAN 3 Bandung',
    votes: 412,
    pages: '9 pages',
    tag: 'accent',
  },
  {
    subject: 'Kimia',
    title: 'Stoikiometri: 40 soal + pembahasan',
    author: 'Rizky A. · SMAN 8 Jakarta',
    votes: 388,
    pages: '14 pages',
    tag: 'accent',
  },
  {
    subject: 'Biologi',
    title: 'Klasifikasi makhluk hidup — mind map',
    author: 'Aisyah R. · SMA Labschool',
    votes: 301,
    pages: '4 pages',
    tag: 'sage',
  },
  {
    subject: 'Matematika',
    title: 'Trigonometri dasar — rangkuman 2 halaman',
    author: 'Bima S. · SMAN 1 Surabaya',
    votes: 276,
    pages: '2 pages',
    tag: 'sage',
  },
  {
    subject: 'Sejarah',
    title: 'Kerajaan Hindu-Buddha — timeline',
    author: 'Gita M. · SMAN 5 Semarang',
    votes: 254,
    pages: '6 pages',
    tag: 'neutral',
  },
  {
    subject: 'B. Inggris',
    title: 'Narrative text + latihan soal',
    author: 'Farel D. · SMAN 2 Medan',
    votes: 198,
    pages: '7 pages',
    tag: 'neutral',
  },
] as const;
export const CONTRIBUTORS = [
  { initials: 'NP', name: 'Nadia P.', school: 'SMAN 3 Bandung', xp: '4.2k' },
  { initials: 'RA', name: 'Rizky A.', school: 'SMAN 8 Jakarta', xp: '3.8k' },
  { initials: 'AR', name: 'Aisyah R.', school: 'SMA Labschool', xp: '2.9k' },
  { initials: 'BS', name: 'Bima S.', school: 'SMAN 1 Surabaya', xp: '2.1k' },
];

// ── Practice ──────────────────────────────────────────────────────────────────
export const OTHER_SETS = [
  { subject: 'Fisika', title: 'Vektor satuan', meta: '6 soal · 8 min' },
  { subject: 'Matematika', title: 'Fungsi kuadrat', meta: '10 soal · 15 min' },
  { subject: 'Biologi', title: 'Virus & bakteri', meta: '8 soal · 10 min' },
  { subject: 'Kimia', title: 'Past paper · SAS 2023', meta: '35 soal · 60 min' },
];
export const WHY_SET = [
  'Four of your last twelve Kimia answers failed on the same step.',
  'Concepts sit at 82%, so the questions skip the definitions.',
  'Sumatif Akhir Semester is five days out. Kimia is first on the timetable.',
];
export const QUESTION = {
  correct: 1,
  options: [
    { key: 'A', label: '0,05 mol' },
    { key: 'B', label: '0,1 mol' },
    { key: 'C', label: '1 mol' },
    { key: 'D', label: '9,8 mol' },
  ],
};

// ── Notes / Create / AI ───────────────────────────────────────────────────────
export const NOTE_SECTIONS = [
  'Massa atom relatif',
  'Massa molekul relatif',
  'Konsep mol',
  'Hubungan mol–massa',
  'Molaritas',
];
export const NOTE_CHIPS = [
  {
    label: 'Add the missing STP step',
    reply:
      'Added under Konsep mol: n = V / 22,4 at STP, with your 9,8 g H₂SO₄ example carried through both formulas.',
  },
  {
    label: 'Quiz me on this section',
    reply:
      'Four questions queued — two on n = m / Mr, two on unit conversion, which is where you lost marks last time.',
  },
  {
    label: 'Explain molaritas simply',
    reply:
      'Molaritas is mol per litre. Same mol you already know, divided by how much water it is sitting in.',
  },
];
export const BLOCKS = [
  { kind: 'h', text: 'Stoikiometri — Konsep Mol' },
  { kind: 'p', text: 'Mol adalah satuan jumlah zat. Satu mol berisi 6,022 × 10²³ partikel.' },
  { kind: 'f', text: 'n = m / Mr' },
  { kind: 'p', text: 'Contoh: 9,8 gram H₂SO₄ dengan Mr = 98 → n = 0,1 mol.' },
] as const;
export const INSERTABLES = [
  'Heading',
  'Formula',
  'Diagram',
  'Worked example',
  'Question',
  'From my practice log',
];
export const GAP_CHECKS = [
  { label: 'Hubungan mol–volume (STP) is missing', kind: 'gap' },
  { label: 'Two formulas, no worked example for the second', kind: 'gap' },
  { label: 'Matches the kelas 10 curriculum for Kimia', kind: 'ok' },
  { label: 'No overlap with the top Stoikiometri note', kind: 'ok' },
] as const;
export const AUDIENCES = ['Just me', 'My class', 'My school', 'All of Notarium'];

export const AI_PROMPTS = [
  {
    icon: 'scanSearch',
    label: 'Why do I keep failing this step?',
    reply:
      'Across nine attempts you chose the angle to the wrong axis whenever the diagram was rotated. The formula was right every time. It is a reading problem, not a physics one.',
  },
  {
    icon: 'listChecks',
    label: 'Quiz me until I get three right',
    reply:
      'Six questions loaded, all rotated axes, stopping early if you clear three in a row. Nothing else counts toward the set.',
  },
  {
    icon: 'lightbulb',
    label: 'Explain it like Paul did',
    reply:
      'Draw the axes first, every time, before you write sin or cos. He made you redraw four times because the drawing is the decision — the formula only records it.',
  },
  {
    icon: 'sparkles',
    label: 'What should I do tonight?',
    reply:
      'Twenty minutes: the six rotated-axis questions, then the Stoikiometri note you left at Konsep Mol. Skip revision cards tonight, they are not due until Thursday.',
  },
] as const;
export const AI_STATE = [
  { label: 'Reading your notes', value: '24 notes · 6 subjects' },
  { label: 'Watching mistakes', value: '41 logged this month' },
  { label: 'Knows your calendar', value: 'SAS in 5 days' },
  { label: 'Heard your last session', value: 'Paul · Vektor' },
];
export const AI_SCOPES = ['This note', 'Kimia', 'Everything I know about you'];
export const CMD_ROWS = [
  { label: 'Explain penguraian komponen', meta: 'AI · Fisika', kind: 'ai' },
  { label: 'Quiz me · rotated axes', meta: 'Practice · 6 soal', kind: 'practice' },
  { label: 'Stoikiometri — Konsep Mol', meta: 'Note · draft', kind: 'note' },
  { label: 'Book Rosmyas · 20:00', meta: 'Tutor · Kimia', kind: 'tutor' },
  { label: 'Add module · Past papers', meta: 'Space', kind: 'module' },
] as const;
export const AI_REPLY =
  'Taken against your state, not in general: penguraian komponen is the 44% and the SAS is five days out, so that is where the answer starts.';

// ── Session ───────────────────────────────────────────────────────────────────
export const DIAGNOSTIC = [
  { label: 'Resultan dua vektor', pct: 71, note: 'can do it graphically, not by components' },
  { label: 'Penguraian komponen', pct: 44, note: 'sin/cos swapped in 5 of 9 attempts' },
  { label: 'Vektor satuan', pct: 58, note: 'correct when the axes are drawn for them' },
];
export const SESSION_GOALS = [
  { label: 'Penguraian komponen — sin vs cos', meta: 'from 5 wrong answers', primary: true },
  { label: 'Soal 12 — resultan tiga vektor', meta: 'student flagged', primary: false },
  { label: 'Vektor satuan notation', meta: 'if time allows', primary: false },
];
export const FEEDBACK = [
  {
    label: 'What we covered',
    value: 'Penguraian komponen from scratch. Drew the axes every time before writing sin or cos.',
  },
  {
    label: 'Where he still slips',
    value:
      'Chooses the angle to the wrong axis when the diagram is rotated. Needs rotated-axis practice, not more component practice.',
  },
  { label: 'Recommend next', value: 'Six rotated-axis questions, then re-test resultan.' },
];
export const MASTERY_DELTA = [
  { label: 'Penguraian komponen', from: 44, to: 61 },
  { label: 'Resultan dua vektor', from: 71, to: 74 },
  { label: 'Vektor satuan', from: 58, to: 58 },
];
export const BOOK_KINDS = [
  { label: 'Tutor session · 1:1', body: 'One peer, your weak topic, diagnostic sent ahead.' },
  {
    label: 'Study group · peers',
    body: 'Up to four of you on the same topic. Slot stays open for others.',
  },
  {
    label: 'TA clinic · drop-in',
    body: 'Paul or Rosmyas, whoever is on the clinic slot. No agenda needed.',
  },
];
export const BOOK_TOPICS = [
  'Penguraian komponen',
  'Rotated-axis vektor',
  'Konsep mol',
  'Trigonometri',
  'Let them decide',
];

// ── Onboarding ───────────────────────────────────────────────────────────────
export const OB_SUBJECTS = [
  'Matematika',
  'Fisika',
  'Kimia',
  'Biologi',
  'B. Indonesia',
  'B. Inggris',
  'Sejarah',
  'Ekonomi',
  'Geografi',
  'Sosiologi',
];
export const OB_HABITS = [
  { label: 'Practice first', body: 'Questions before reading. I learn by getting it wrong.' },
  { label: 'Reading first', body: 'Notes and explanation before I try anything.' },
  { label: 'Ask first', body: 'I want it explained, then I will practise.' },
  { label: 'With people', body: 'Study groups, shared notes, someone to compare with.' },
];
export const OB_RESULT: Record<string, string> = {
  'Reading first':
    'Notes and your mastery bars lead. Practice sits below them until you start answering more than you read.',
  'With people':
    'Community notes and study groups lead. The AI stays quiet until you ask it something.',
  'Ask first':
    'The AI companion leads, with one practice set under it. Notes are one tap away, not on the canvas.',
  'Practice first':
    'A practice set leads every morning, sized to your session length. Notes appear when a set exposes a gap.',
};
export const ADAPT_OPTIONS = [
  { label: 'Automatic', body: 'Notarium decides the whole layout, every day.' },
  { label: 'Hybrid', body: 'Keeps your layout, promotes one module when it matters.' },
  { label: 'Manual', body: 'Nothing moves unless you move it.' },
] as const;
export const ADAPT_EXPLAINER: Record<string, string> = {
  Automatic:
    'Automatic redraws the canvas from your learning state each morning. Fastest to the right thing, hardest to predict.',
  Manual:
    'Manual freezes the canvas. Notarium can still tell you something urgent came up, but it will not move a single module.',
  Hybrid:
    'Hybrid keeps the order you set. When something urgent appears — an exam inside a week, a topic falling below fifty — one module is promoted to the top and labelled, and the rest stays put.',
};
