/**
 * Icons: Lucide only (21st.dev/community/icons → lucide.dev), stroke-width 2.75 per the
 * Organic design system. Import from here so the weight stays consistent everywhere.
 */
import {
  ArrowUp,
  ChartLine,
  Compass,
  Dumbbell,
  GripVertical,
  House,
  KeyRound,
  Lightbulb,
  ListChecks,
  NotebookPen,
  Paperclip,
  PencilLine,
  Plus,
  ScanSearch,
  School,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
  X,
  type LucideProps,
} from 'lucide-react';

export const STROKE = 2.75;

const wrap = (C: React.ComponentType<LucideProps>) =>
  function Icon(props: LucideProps) {
    return <C strokeWidth={STROKE} size={18} aria-hidden {...props} />;
  };

export const I = {
  house: wrap(House),
  compass: wrap(Compass),
  dumbbell: wrap(Dumbbell),
  notebook: wrap(NotebookPen),
  users: wrap(UsersRound),
  chart: wrap(ChartLine),
  pencil: wrap(PencilLine),
  sparkles: wrap(Sparkles),
  sliders: wrap(SlidersHorizontal),
  grip: wrap(GripVertical),
  x: wrap(X),
  plus: wrap(Plus),
  arrowUp: wrap(ArrowUp),
  search: wrap(Search),
  paperclip: wrap(Paperclip),
  lightbulb: wrap(Lightbulb),
  listChecks: wrap(ListChecks),
  scanSearch: wrap(ScanSearch),
  school: wrap(School),
  keyRound: wrap(KeyRound),
  userRound: wrap(UserRound),
};
export type IconName = keyof typeof I;
