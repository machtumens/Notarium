interface GradeClassFilterProps {
  value: 'my_class' | 'my_grade';
  onChange: (value: 'my_class' | 'my_grade') => void;
  userClass?: string;
  userGrade?: number;
}

export default function GradeClassFilter({
  value,
  onChange,
  userClass,
  userGrade,
}: GradeClassFilterProps) {
  return (
    <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-1 border border-zinc-700/50">
      <button
        onClick={() => onChange('my_class')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          value === 'my_class' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        My Class{userClass ? ` (${userClass})` : ''}
      </button>
      <button
        onClick={() => onChange('my_grade')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          value === 'my_grade' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        My Grade{userGrade ? ` (Grade ${userGrade})` : ''}
      </button>
    </div>
  );
}
