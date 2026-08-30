import { logger } from './logger';
import { browserZone } from './datetime';
import type {
  User,
  LoginResponse,
  LoginCredentials,
  SignupData,
  ProfileUpdateData,
  Note,
  CreateNoteData,
  NotesResponse,
  SubjectsResponse,
  RequestOptions,
  GradeClass,
  GradeClassesResponse,
  AppNotification,
  NotificationsListResponse,
  UnreadCountResponse,
  TwoFactorSetup,
  TwoFactorEnableResponse,
  ForgotPasswordResponse,
  SetPasswordResponse,
  PromoteClassesResponse,
  AdminSubject,
  OpsHealth,
  OpsMetrics,
  OpsTimeseries,
  OpsFlags,
  OpsCloudflare,
  PrimerResponse,
} from '../types';

const baseURL =
  import.meta.env.MODE === 'development'
    ? 'http://localhost:8787'
    : import.meta.env.VITE_API_URL || 'https://notarium-backend.notarium-backend.workers.dev';

const TOKEN_KEY = 'notarium_token';

let cachedToken: string | null = null;

if (typeof window !== 'undefined') {
  cachedToken = sessionStorage.getItem(TOKEN_KEY);
}

const getToken = () => {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(TOKEN_KEY);
  }
  return cachedToken;
};

const setToken = (token: string) => {
  cachedToken = token;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
};

// Single-note detail shape returned by GET /api/notes/:id. Kept local to the
// api/process surface (not added to the shared `Note` type) because it carries
// `status` and nullable fields the community-facing `Note` does not model.
export interface NoteDetail {
  id: number;
  title: string;
  extracted_text: string | null;
  description: string | null;
  image_path: string | null;
  summary: string | null;
  status: string | null;
  subject_id: number;
}

export const api = {
  // ponytail: default T = any so the many legacy untyped callers (response.foo)
  // keep working; typed callers still pass an explicit <T> and get full safety.
  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = `${baseURL}${endpoint}`;

    const currentToken = getToken();
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config as RequestInit);
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error || `API request failed: ${response.status}`;
      // Log only non-sensitive fields — never log full response bodies or token length.
      logger.error('api', `Error ${response.status}`, { url, hasToken: !!currentToken });
      throw new Error(errorMsg);
    }

    return data;
  },

  isAuthenticated: () => !!getToken(),

  getToken,
  setToken,

  clearToken: () => {
    cachedToken = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  },

  logout: () => {
    api.clearToken();
  },

  auth: {
    signup: (data: SignupData): Promise<LoginResponse> =>
      api.request<LoginResponse>('/api/auth/signup', {
        method: 'POST',
        body: data,
      }),
    login: (credentials: LoginCredentials): Promise<LoginResponse> =>
      api.request<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: credentials,
      }),
    adminLogin: (credentials: LoginCredentials): Promise<LoginResponse> =>
      api.request<LoginResponse>('/api/auth/admin-login', {
        method: 'POST',
        body: credentials,
      }),
    verify2fa: (challenge: string, code: string): Promise<LoginResponse> =>
      api.request<LoginResponse>('/api/auth/2fa/verify', {
        method: 'POST',
        body: { challenge, code },
      }),
    me: (): Promise<{ user: User }> =>
      api.request<{ user: User }>('/api/auth/me', { method: 'GET' }),
  },

  twoFactor: {
    setup: (): Promise<TwoFactorSetup> =>
      api.request<TwoFactorSetup>('/api/auth/2fa/setup', { method: 'POST' }),
    enable: (code: string): Promise<TwoFactorEnableResponse> =>
      api.request<TwoFactorEnableResponse>('/api/auth/2fa/enable', {
        method: 'POST',
        body: { code },
      }),
    disable: (params: { code?: string; password?: string }): Promise<{ success: boolean }> =>
      api.request<{ success: boolean }>('/api/auth/2fa/disable', {
        method: 'POST',
        body: params,
      }),
  },

  forgotPassword: (email: string): Promise<ForgotPasswordResponse> =>
    api.request<ForgotPasswordResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    }),

  setPassword: (newPassword: string): Promise<SetPasswordResponse> =>
    api.request<SetPasswordResponse>('/api/auth/set-password', {
      method: 'POST',
      body: { newPassword },
    }),

  register: async (
    email: string,
    password: string,
    name: string,
    _role: string,
    classValue: string,
    academic_year?: string,
  ) => {
    // Captured here, not asked for: the browser already knows, and a signup
    // form is the wrong place to make a fifteen-year-old pick an IANA zone. The
    // server drops it if it cannot format in it, and Settings can correct it.
    const response = await api.auth.signup({
      email,
      password,
      name,
      class: classValue,
      ...(academic_year && { academic_year }),
      ...(browserZone() && { timezone: browserZone() }),
    });
    if (response.token) {
      setToken(response.token);
    }
    return { success: true, user: response.user, token: response.token };
  },

  login: async (email: string, password: string) => {
    const response = await api.auth.login({ email, password });
    if (response.requires_2fa) {
      return response;
    }
    if (response.token) {
      setToken(response.token);
    }
    return { success: true, user: response.user, token: response.token };
  },

  getCurrentUser: async (): Promise<User> => {
    const token = getToken();
    logger.debug('api', 'getCurrentUser', { hasToken: !!token });
    const response = await api.request<User>('/api/auth/me', {
      method: 'GET',
    });
    return response;
  },

  updateProfile: async (data: ProfileUpdateData): Promise<User> => {
    const token = getToken();
    logger.debug('api', 'updateProfile', { hasToken: !!token });
    const response = await api.request<User>('/api/auth/profile', {
      method: 'PUT',
      body: data,
    });
    return response;
  },

  notes: {
    getAll: (): Promise<NotesResponse> => api.request<NotesResponse>('/api/notes'),
    create: (note: CreateNoteData): Promise<Note> =>
      api.request<Note>('/api/notes', {
        method: 'POST',
        body: note,
      }),
    getNote: (id: number): Promise<{ note: NoteDetail }> =>
      api.request<{ note: NoteDetail }>(`/api/notes/${id}`, { method: 'GET' }),
  },

  getNotes: (): Promise<NotesResponse> => api.request<NotesResponse>('/api/notes'),

  subjects: {
    getAll: (): Promise<SubjectsResponse> => api.request<SubjectsResponse>('/api/subjects'),
  },

  getSubjects: async () => {
    try {
      const response = await api.request('/api/subjects');
      return {
        subjects: response.subjects || response.data || response || [],
      };
    } catch (error) {
      return { subjects: [] };
    }
  },

  getSubjectNotes: async (subjectId: number) => {
    try {
      const response = await api.request(`/api/subjects/${subjectId}/notes`);
      return {
        notes: response.notes || response.data || response || [],
      };
    } catch (error) {
      return { notes: [] };
    }
  },

  getLeaderboard: async () => {
    try {
      const response = await api.request('/api/leaderboard');
      return {
        leaderboard: response.leaderboard || response.data || response || [],
      };
    } catch (error) {
      return { leaderboard: [] };
    }
  },

  searchNotes: async (query: string) => {
    try {
      const response = await api.request(`/api/notes/search?q=${encodeURIComponent(query)}`);
      return {
        notes: response.notes || response.data || [],
      };
    } catch (error) {
      return { notes: [] };
    }
  },

  likeNote: async (noteId: number) => {
    try {
      const response = await api.request(`/api/notes/${noteId}/like`, {
        method: 'POST',
      });
      return { success: true, note: response.note };
    } catch (error) {
      return { success: false };
    }
  },

  upvoteNote: async (noteId: number) => {
    try {
      const response = await api.request(`/api/notes/${noteId}/upvote`, {
        method: 'POST',
      });
      return { success: true, note: response.note };
    } catch (error) {
      return { success: false };
    }
  },

  ai: {
    generateSummary: async (noteId: number, content: string = '') => {
      const response = await api.request(`/api/notes/${noteId}/summary`, {
        method: 'POST',
        body: { content },
      });
      return { summary: response.summary || '' };
    },
    generateQuiz: async (noteId: number, content: string = '') => {
      const response = await api.request(`/api/notes/${noteId}/quiz`, {
        method: 'POST',
        body: { content },
      });
      return { quiz: response.quiz || { questions: [] } };
    },
    // Structured multi-type quiz (POST /api/ai/quiz). Source is a single owned
    // note or the caller's own notes within a subject (author-scoped server-side).
    generateStructuredQuiz: async (params: {
      source_type: 'note' | 'subject';
      source_id: number;
      count: number;
      difficulty: 'easy' | 'medium' | 'hard';
      types: Array<'mcq' | 'true_false' | 'short_answer'>;
    }) => {
      const response = await api.request('/api/ai/quiz', {
        method: 'POST',
        body: params,
      });
      return { questions: response.questions || [] };
    },
    generateStudyPlan: async (subject: string, topic: string) => {
      const response = await api.request('/api/study-plan', {
        method: 'POST',
        body: { subject, topic },
      });
      return { plan: response.plan || '' };
    },
    explainConcept: async (concept: string) => {
      const response = await api.request('/api/concept-explain', {
        method: 'POST',
        body: { concept },
      });
      return { explanation: response.explanation || '' };
    },
    // Stateless class primer (POST /api/ai/primer). Topic string only — no note,
    // no DB read, no persistence. Returns the flat 3-field PrimerResponse shape.
    generatePrimer: async (topic: string): Promise<PrimerResponse> => {
      const response = await api.request('/api/ai/primer', {
        method: 'POST',
        body: { topic },
      });
      return {
        overview: response.overview || '',
        key_concepts: response.key_concepts || [],
        questions: response.questions || [],
      };
    },
    performOCR: async (imageBase64: string, mimeType: string = 'image/jpeg') => {
      const response = await api.request('/api/gemini/ocr', {
        method: 'POST',
        body: { imageBase64, mimeType },
      });
      return { text: response.text || '', success: response.success || false };
    },
  },

  debug: {
    testUpdate: async (userId: number, name: string) => {
      const response = await api.request('/api/debug/verify-update', {
        method: 'POST',
        body: { userId, name },
      });
      return response;
    },
  },

  admin: {
    verify: async (email: string, password: string) => {
      try {
        const response = await api.request('/api/admin/verify', {
          method: 'POST',
          body: { email, password },
        });
        return { success: response.success || false };
      } catch (error: unknown) {
        return { success: false };
      }
    },
    getUsers: async () => {
      try {
        const response = await api.request('/api/admin/users', {
          method: 'GET',
        });
        return { users: response.users || [] };
      } catch (error) {
        return { users: [] };
      }
    },
    getNotes: async () => {
      try {
        const response = await api.request('/api/admin/notes', {
          method: 'GET',
        });
        return { notes: response.notes || [] };
      } catch (error) {
        return { notes: [] };
      }
    },
    deleteUser: async (userId: number) => {
      await api.request(`/api/admin/user/${userId}`, {
        method: 'DELETE',
      });
      return { success: true };
    },
    suspendUser: async (userId: number, days: number, reason: string) => {
      const response = await api.request(`/api/admin/suspend/${userId}`, {
        method: 'POST',
        body: { days, reason },
      });
      return { success: true, ...response };
    },
    warnUser: async (userId: number, message: string) => {
      const response = await api.request(`/api/admin/warn/${userId}`, {
        method: 'POST',
        body: { message },
      });
      return { success: true, ...response };
    },
    unsuspendUser: async (userId: number) => {
      const response = await api.request(`/api/admin/unsuspend/${userId}`, {
        method: 'POST',
      });
      return { success: true, ...response };
    },
    likeNote: async (noteId: number) => {
      const response = await api.request(`/api/admin/notes/${noteId}/like`, {
        method: 'POST',
      });
      return { liked: response.liked };
    },
    deleteNote: async (noteId: number) => {
      const response = await api.request(`/api/admin/notes/${noteId}`, {
        method: 'DELETE',
      });
      return { success: response.success };
    },
    restoreNote: async (noteId: number) => {
      const response = await api.request(`/api/admin/notes/${noteId}/restore`, {
        method: 'POST',
      });
      return { success: response.success };
    },
    featureNote: async (noteId: number) => {
      const response = await api.request(`/api/admin/notes/${noteId}/feature`, {
        method: 'POST',
      });
      return { success: response.success, featured: response.featured };
    },
    searchNotes: async (params: {
      q?: string;
      subject?: string;
      status?: string;
      sort?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.subject) qs.set('subject', params.subject);
      if (params.status) qs.set('status', params.status);
      if (params.sort) qs.set('sort', params.sort);
      const query = qs.toString();
      try {
        const response = await api.request(`/api/admin/notes${query ? `?${query}` : ''}`, {
          method: 'GET',
        });
        return { notes: response.notes || [] };
      } catch (error) {
        return { notes: [] };
      }
    },
    updateUser: async (
      userId: number,
      data: {
        display_name?: string;
        class?: string;
        diamonds?: number;
        learning_points?: number;
      },
    ) => {
      const response = await api.request(`/api/admin/user/${userId}`, {
        method: 'PUT',
        body: data,
      });
      return { success: response.success, user: response.user };
    },
    getSubjects: () =>
      api.request<{ subjects: AdminSubject[] }>('/api/admin/subjects', { method: 'GET' }),
    createSubject: (data: { name: string; icon?: string }) =>
      api.request<{ subject: AdminSubject }>('/api/admin/subjects', {
        method: 'POST',
        body: data,
      }),
    updateSubject: (id: number, data: { name?: string; icon?: string }) =>
      api.request<{ subject: AdminSubject }>(`/api/admin/subjects/${id}`, {
        method: 'PUT',
        body: data,
      }),
    deleteSubject: (id: number) =>
      api.request<{ success: boolean }>(`/api/admin/subjects/${id}`, { method: 'DELETE' }),
    getGradeClasses: () => api.request<{ grade_classes: GradeClass[] }>('/api/admin/grade-classes'),
    createGradeClass: (data: { grade: number; class_name: string; semester?: string }) =>
      api.request<{ grade_class: GradeClass }>('/api/admin/grade-classes', {
        method: 'POST',
        body: data,
      }),
    updateGradeClass: (id: number, data: Partial<GradeClass>) =>
      api.request<{ grade_class: GradeClass }>(`/api/admin/grade-classes/${id}`, {
        method: 'PUT',
        body: data,
      }),
    deleteGradeClass: (id: number) =>
      api.request<{ success: boolean }>(`/api/admin/grade-classes/${id}`, { method: 'DELETE' }),
    reassignUserClass: (data: {
      user_id: number;
      new_class: string;
      send_notification?: boolean;
    }) =>
      api.request<{ success: boolean }>('/api/admin/grade-classes/reassign', {
        method: 'POST',
        body: data,
      }),
    promoteClasses: (class_ids: number[], new_academic_year?: string) =>
      api.request<PromoteClassesResponse>('/api/admin/grade-classes/promote', {
        method: 'POST',
        body: { class_ids, ...(new_academic_year && { new_academic_year }) },
      }),
    getNotifications: () => api.request<NotificationsListResponse>('/api/admin/notifications'),
    createNotification: (data: {
      target_type: string;
      target_grade?: number;
      target_class?: string;
      target_user_id?: number;
      notification_type?: string;
      title: string;
      message: string;
    }) =>
      api.request<{ notification: AppNotification }>('/api/admin/notifications', {
        method: 'POST',
        body: data,
      }),
    deleteNotification: (id: number) =>
      api.request<{ success: boolean }>(`/api/admin/notifications/${id}`, { method: 'DELETE' }),
  },

  ops: {
    health: () => api.request<OpsHealth>('/api/health'),
    metrics: () => api.request<OpsMetrics>('/api/ops/metrics'),
    timeseries: (metric: string, range: number) =>
      api.request<OpsTimeseries>(
        `/api/ops/timeseries?metric=${encodeURIComponent(metric)}&range=${range}`,
      ),
    flags: () => api.request<OpsFlags>('/api/ops/flags'),
    cloudflare: (range = 7) => api.request<OpsCloudflare>(`/api/ops/cloudflare?range=${range}`),
    setMaintenance: (on: boolean) =>
      api.request<{ success: boolean; maintenance: boolean }>('/api/ops/maintenance', {
        method: 'POST',
        body: { on },
      }),
    setFlag: (flag: string, enabled: boolean) =>
      api.request<{ success: boolean; flag: string; enabled: boolean }>('/api/ops/flags', {
        method: 'POST',
        body: { flag, enabled },
      }),
    recompute: (target: string) =>
      api.request<{ success: boolean; target: string; skipped?: boolean }>('/api/ops/recompute', {
        method: 'POST',
        body: { target },
      }),
    // Fetches the CSV as text and triggers a browser download.
    exportActivityLog: async () => {
      const token = getToken();
      const res = await fetch(`${baseURL}/api/ops/activity-log.csv`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) {
        throw new Error(`Export failed: ${res.status}`);
      }
      const csv = await res.text();
      if (typeof window !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = 'admin-activity-log.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      }
      return csv;
    },
    purgeNotes: (days: number) =>
      api.request<{ success: boolean; deleted: number }>('/api/ops/danger/purge-notes', {
        method: 'POST',
        body: { olderThanDays: days },
      }),
    revokeTokens: () =>
      api.request<{ success: boolean }>('/api/ops/danger/revoke-tokens', {
        method: 'POST',
      }),
  },

  getGradeClasses: () => api.request<GradeClassesResponse>('/api/grade-classes'),

  notifications: {
    getAll: () => api.request<NotificationsListResponse>('/api/notifications'),
    getUnreadCount: () => api.request<UnreadCountResponse>('/api/notifications/unread-count'),
    markRead: (id: number) =>
      api.request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () =>
      api.request<{ success: boolean }>('/api/notifications/read-all', { method: 'POST' }),
  },

  logQuizAttempt: (payload: {
    note_id?: number;
    question_text: string;
    is_correct: boolean;
    confidence?: number;
  }): Promise<{
    success: boolean;
    due_at: string;
    current_streak: number;
    learning_points: number;
  }> => api.request('/api/quiz/attempt', { method: 'POST', body: payload }),

  getDueReviews: (): Promise<{
    items: Array<{
      id: number;
      note_id: number | null;
      question_text: string;
      question_hash: string;
      ease_factor: number;
      interval_days: number;
      repetitions: number;
      due_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
    due_count: number;
  }> => api.request('/api/reviews/due'),

  gradeReview: (
    itemId: number,
    payload: { is_correct: boolean; confidence?: number },
  ): Promise<{
    due_at: string;
    current_streak: number;
    learning_points: number;
  }> => api.request(`/api/reviews/${itemId}/grade`, { method: 'POST', body: payload }),

  gradeRecall: (payload: {
    note_id?: number;
    note_content: string;
    recall_text: string;
  }): Promise<{
    score: number;
    feedback: string;
    missed_points: string[];
  }> => api.request('/api/recall/grade', { method: 'POST', body: payload }),

  getTutors: (
    subjectId?: number,
  ): Promise<{
    tutors: Array<{
      id: number;
      user_id: number;
      name: string;
      photo_url: string | null;
      grade: number | null;
      alumni: boolean;
      subject_id: number;
      subject_name: string | null;
      subject_icon: string | null;
      blurb: string | null;
      grade_min: number | null;
      grade_max: number | null;
      languages: string | null;
      rating_avg: number | null;
      session_count: number;
      learning_points: number;
    }>;
  }> => api.request(`/api/tutors${subjectId ? `?subject_id=${subjectId}` : ''}`),

  getSessions: (): Promise<{
    sessions: Array<{
      id: number;
      topic: string | null;
      kind: string;
      seat_cap: number;
      seats_taken: number;
      seats_left: number;
      i_am_in: boolean;
      i_am_tutor: boolean;
      starts_at: string;
      ends_at: string;
      location: string | null;
      tutor_name: string;
      tutor_user_id: number;
      subject_name: string | null;
      subject_icon: string | null;
    }>;
  }> => api.request('/api/sessions'),

  bookSession: (id: number): Promise<{ success: boolean; seat_no: number }> =>
    api.request(`/api/sessions/${id}/book`, { method: 'POST' }),

  completeSession: (
    id: number,
  ): Promise<{
    success: boolean;
    points_awarded?: number;
    already_completed?: boolean;
    attended?: number;
  }> => api.request(`/api/sessions/${id}/complete`, { method: 'POST' }),

  rateBooking: (
    bookingId: number,
    rating: number,
  ): Promise<{ success: boolean; rating: number; rating_avg: number | null }> =>
    api.request(`/api/bookings/${bookingId}/rate`, { method: 'POST', body: { rating } }),

  cancelSession: (id: number): Promise<{ success: boolean; cancelled: string }> =>
    api.request(`/api/sessions/${id}/cancel`, { method: 'POST' }),

  getTutorEligibility: (): Promise<{
    eligible: boolean;
    reasons: string[];
    learning_points: number;
    notes_uploaded: number;
    requirements: { learning_points: number; notes_uploaded: number };
    my_profiles: Array<{ id: number; subject_id: number; status: string; subject_name: string }>;
  }> => api.request('/api/tutors/eligibility'),

  applyAsTutor: (payload: {
    subject_id: number;
    blurb?: string;
    grade_min?: number;
    grade_max?: number;
  }): Promise<{ success: boolean; status: string; message: string }> =>
    api.request('/api/tutors/apply', { method: 'POST', body: payload }),

  getBadges: (): Promise<{
    badges: Array<{
      key: string;
      label: string;
      hint: string;
      earned: boolean;
      progress?: { have: number; need: number };
      unavailable?: string;
    }>;
    rank: number;
    tests_completed: number;
  }> => api.request('/api/badges'),

  completeTest: (payload: {
    question_count: number;
    correct_count: number;
    source_type?: string | null;
    source_id?: number | null;
    duration_sec?: number | null;
  }): Promise<{
    success: boolean;
    score_pct: number;
    tests_completed: number;
    previous: { score_pct: number; created_at: string; delta: number } | null;
  }> => api.request('/api/tests/complete', { method: 'POST', body: payload }),

  getStudyStats: (): Promise<{
    current_streak: number;
    longest_streak: number;
    learning_points: number;
    due_count: number;
  }> => api.request('/api/study/stats'),
};

export default api;
