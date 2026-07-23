import { logger } from './logger';
import type {
  User,
  LoginResponse,
  LoginCredentials,
  SignupData,
  ProfileUpdateData,
  Note,
  CreateNoteData,
  Subject,
  Quiz,
  QuizGenerationRequest,
  StudyPlanRequest,
  ConceptExplanationRequest,
  SummaryRequest,
  ChatSession,
  ChatMessage,
  LeaderboardEntry,
  NotesResponse,
  SubjectsResponse,
  LeaderboardResponse,
  ChatSessionsResponse,
  ChatMessagesResponse,
  SummaryResponse,
  QuizResponse,
  StudyPlanResponse,
  ConceptExplanationResponse,
  OCRResponse,
  SuspendUserRequest,
  WarnUserRequest,
  RequestOptions,
  getErrorMessage,
  GradeClass,
  GradeClassesResponse,
  AppNotification,
  NotificationsListResponse,
  UnreadCountResponse,
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

export const api = {
  async request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
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

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error || `API request failed: ${response.status}`;
      console.error(`API Error (${response.status}):`, {
        url,
        status: response.status,
        error: errorMsg,
        fullResponse: data,
        hasToken: !!currentToken,
        tokenLength: currentToken?.length || 0,
      });
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
  },

  register: async (
    email: string,
    password: string,
    name: string,
    role: string,
    classValue: string,
  ) => {
    const response = await api.auth.signup({ email, password, name, class: classValue });
    if (response.token) {
      setToken(response.token);
    }
    return { success: true, user: response.user, token: response.token };
  },

  login: async (email: string, password: string) => {
    const response = await api.auth.login({ email, password });
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

  chat: {
    createSession: async (subject: string, topic: string) => {
      const response = await api.request('/api/chat/sessions', {
        method: 'POST',
        body: { subject, topic },
      });
      return { session: response.session };
    },
    getSessions: async () => {
      try {
        const response = await api.request('/api/chat/sessions', {
          method: 'GET',
        });
        return { sessions: response.sessions || [] };
      } catch (error) {
        return { sessions: [] };
      }
    },
    getMessages: async (sessionId: number) => {
      try {
        const response = await api.request(`/api/chat/sessions/${sessionId}/messages`, {
          method: 'GET',
        });
        return { messages: response.messages || [] };
      } catch (error) {
        return { messages: [] };
      }
    },
    addMessage: async (sessionId: number, role: string, content: string) => {
      const response = await api.request(`/api/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: { role, content },
      });
      return { message: response.message };
    },
    getAIResponse: async (message: string, subject: string) => {
      const response = await api.request('/api/chat/ai-response', {
        method: 'POST',
        body: { message, subject },
      });
      return { response: response.response || '' };
    },
    uploadDocument: async (documentBase64: string, fileName: string, sessionId: number) => {
      const response = await api.request('/api/chat/upload-document', {
        method: 'POST',
        body: { documentBase64, fileName, sessionId },
      });
      return {
        success: true,
        document: response.document || { fileName },
        message: response.message || '',
      };
    },
    analyzeNotes: async (subject: string, topic?: string) => {
      const response = await api.request('/api/chat/analyze-notes', {
        method: 'POST',
        body: { subject, topic },
      });
      return { analysis: response.analysis || '', keyConcepts: response.keyConcepts || [] };
    },
  },

  ai: {
    generateSummary: async (noteId: number, content: string) => {
      const response = await api.request(`/api/notes/${noteId}/summary`, {
        method: 'POST',
        body: { content },
      });
      return { summary: response.summary || '' };
    },
    generateQuiz: async (noteId: number, content: string) => {
      const response = await api.request(`/api/notes/${noteId}/quiz`, {
        method: 'POST',
        body: { content },
      });
      return { quiz: response.quiz || { questions: [] } };
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
      const response = await api.request(`/api/admin/user/${userId}`, {
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

  getStudyStats: (): Promise<{
    current_streak: number;
    longest_streak: number;
    learning_points: number;
    due_count: number;
  }> => api.request('/api/study/stats'),
};

export default api;
