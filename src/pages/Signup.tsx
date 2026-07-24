import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../lib/api';
import type { GradeClass } from '../types';

const ShaderAnimation = lazy(() =>
  import('@/components/ui/shader-animation').then((m) => ({ default: m.ShaderAnimation })),
);

const SCHOOL_DOMAIN = '@sekolahkristencalvin.org';

// Indonesian school year starts in July (month index >= 6).
function computeAcademicYears(): string[] {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const current = `${startYear}/${startYear + 1}`;
  const next = `${startYear + 1}/${startYear + 2}`;
  return [current, next];
}

export default function Signup() {
  const academicYears = useMemo(() => computeAcademicYears(), []);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    grade: '',
    class: '',
    academic_year: academicYears[0],
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [titleNumber, setTitleNumber] = useState(0);
  const [gradeClasses, setGradeClasses] = useState<GradeClass[]>([]);
  const navigate = useNavigate();

  const titles = useMemo(
    () => ['collaborative', 'organized', 'efficient', 'powerful', 'smart'],
    [],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber((prev) => (prev === titles.length - 1 ? 0 : prev + 1));
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  useEffect(() => {
    if (api.isAuthenticated()) {
      navigate('/', { replace: true });
    }
    api
      .getGradeClasses()
      .then((res) => setGradeClasses(res.grade_classes || []))
      .catch(() => {});
  }, [navigate]);

  const availableGrades = useMemo(() => {
    const grades = [...new Set(gradeClasses.map((gc) => gc.grade))].sort();
    return grades;
  }, [gradeClasses]);

  const classesForSelectedGrade = useMemo(() => {
    if (!formData.grade) return [];
    return gradeClasses.filter((gc) => gc.grade === Number(formData.grade) && gc.is_active);
  }, [gradeClasses, formData.grade]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'grade' ? { class: '' } : {}),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email.toLowerCase().endsWith(SCHOOL_DOMAIN)) {
      setError(`Only ${SCHOOL_DOMAIN} email addresses are allowed`);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!formData.class) {
      setError('Please select your class');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.request('/api/auth/signup', {
        method: 'POST',
        body: {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          class: formData.class,
          academic_year: formData.academic_year,
        },
      });

      api.setToken((response as any).token);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during signup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0 bg-black">
        <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
          <ShaderAnimation />
        </Suspense>
      </div>

      <div className="container mx-auto px-4 relative z-10 max-h-screen overflow-y-auto">
        <div className="flex gap-4 py-8 items-center justify-center flex-col max-w-4xl mx-auto">
          <div className="flex gap-2 flex-col items-center">
            <h1 className="text-4xl md:text-5xl max-w-3xl tracking-tighter text-center font-regular text-white">
              <span className="block mb-1">NOTARIUM</span>
              <span className="text-2xl md:text-3xl block">
                <span>A library that's</span>
                <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-2 md:pt-1">
                  &nbsp;
                  {titles.map((title, index) => (
                    <motion.span
                      key={index}
                      className="absolute font-semibold text-white"
                      initial={{ opacity: 0, y: '-100' }}
                      transition={{ type: 'spring', stiffness: 50 }}
                      animate={
                        titleNumber === index
                          ? { y: 0, opacity: 1 }
                          : { y: titleNumber > index ? -150 : 150, opacity: 0 }
                      }
                    >
                      {title}
                    </motion.span>
                  ))}
                </span>
              </span>
            </h1>

            <p className="text-sm md:text-base leading-relaxed tracking-tight text-gray-400 max-w-2xl text-center">
              Join a library of notes
            </p>
          </div>

          <div className="w-full max-w-md">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-lg">
              <h2 className="text-xl font-semibold text-center mb-4 text-white">Create Account</h2>

              {error && (
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-md p-3 mb-4 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="name" className="text-sm font-medium text-white">
                    Full Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="email" className="text-sm font-medium text-white">
                    School Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder={`you${SCHOOL_DOMAIN}`}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                  />
                  <p className="text-xs text-zinc-500">Must end with {SCHOOL_DOMAIN}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="grade" className="text-sm font-medium text-white">
                      Grade
                    </label>
                    <select
                      id="grade"
                      name="grade"
                      value={formData.grade}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                      required
                    >
                      <option value="">Select grade</option>
                      {availableGrades.map((g) => (
                        <option key={g} value={g}>
                          Grade {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="class" className="text-sm font-medium text-white">
                      Class
                    </label>
                    <select
                      id="class"
                      name="class"
                      value={formData.class}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                      required
                      disabled={!formData.grade}
                    >
                      <option value="">Select class</option>
                      {classesForSelectedGrade.map((gc) => (
                        <option key={gc.id} value={gc.class_name}>
                          {gc.class_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="academic_year" className="text-sm font-medium text-white">
                    Academic Year
                  </label>
                  <select
                    id="academic_year"
                    name="academic_year"
                    value={formData.academic_year}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                  >
                    {academicYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="password" className="text-sm font-medium text-white">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-white">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-zinc-700 rounded-md bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="relative w-full h-12 overflow-hidden rounded-md group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 animate-gradient-xy opacity-80 group-hover:opacity-100 transition-opacity"></div>
                  <div className="absolute inset-0.5 bg-black rounded-md flex items-center justify-center">
                    <span className="relative z-10 text-white font-medium text-base">
                      {isLoading ? 'Creating account...' : 'Sign Up'}
                    </span>
                  </div>
                </button>
                <style>{`
                  @keyframes gradient-xy {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                  }
                  .animate-gradient-xy {
                    background-size: 200% 200%;
                    animation: gradient-xy 3s ease infinite;
                  }
                `}</style>
              </form>

              <p className="text-center text-xs text-gray-400 mt-3">
                Already have an account?{' '}
                <a href="/login" className="text-white hover:underline font-medium">
                  Sign in
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
