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
    <div className="flex items-center gap-1 bg-white/60 rounded-lg p-1 border border-[#1c2a22]/10">
      <button
        onClick={() => onChange('my_class')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          value === 'my_class'
            ? 'bg-[#3c4f43]/15 text-[#1c2a22]'
            : 'text-[#3c4f43] hover:text-[#1c2a22]'
        }`}
      >
        My Class{userClass ? ` (${userClass})` : ''}
      </button>
      <button
        onClick={() => onChange('my_grade')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          value === 'my_grade'
            ? 'bg-[#3c4f43]/15 text-[#1c2a22]'
            : 'text-[#3c4f43] hover:text-[#1c2a22]'
        }`}
      >
        My Grade{userGrade ? ` (Grade ${userGrade})` : ''}
      </button>
    </div>
  );
}
