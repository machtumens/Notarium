export interface User {
  id: number;
  email: string;
  name: string;
  class: string;
  grade?: number;
  grade_class_id?: number;
  totp_enabled?: number;
  role: 'student' | 'admin';
  admin_role?: string;
  points: number;
  notes_count: number;
  diamonds?: number;
  total_likes?: number;
  total_admin_upvotes?: number;
  description?: string;
  photo_url?: string;
  suspended?: number;
  suspension_end_date?: string;
  suspension_reason?: string;
  warning?: number;
  warning_message?: string;
}

export interface LoginCredentials {
  email?: string;
  password?: string;
  class?: string;
  token?: string;
}

export interface LoginResponse {
  success?: boolean;
  user?: User;
  token?: string;
  requires_2fa?: boolean;
  challenge?: string;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
  class: string;
  academic_year?: string;
}

export interface TwoFactorSetup {
  secret: string;
  otpauth_uri: string;
}

export interface TwoFactorEnableResponse {
  success: boolean;
  backup_codes: string[];
}

export interface ForgotPasswordResponse {
  recovery: 'google' | 'none';
  message: string;
}

export interface SetPasswordResponse {
  success: boolean;
  message: string;
}

export interface PromoteSummaryItem {
  class: string;
  action: string;
  promoted_to?: string;
  students_affected?: number;
  error?: string;
}

export interface PromoteClassesResponse {
  success: boolean;
  academic_year: string;
  summary: PromoteSummaryItem[];
}

export interface ProfileUpdateData {
  name?: string;
  class?: string;
  description?: string;
  photo_url?: string;
}

export interface Note {
  id: number;
  title: string;
  description: string;
  content?: string;
  extracted_text?: string;
  author_name: string;
  author_class: string;
  author_photo?: string;
  subject_id: number;
  image?: string;
  image_path?: string;
  tags?: string[];
  likes: number;
  admin_upvotes: number;
  created_at: string;
  liked_by_me?: boolean;
  upvoted_by_me?: boolean;
  parent_note_id?: number | null;
  part_number?: number | null;
}

export interface CreateNoteData {
  title: string;
  description?: string;
  content?: string;
  subject_id: number;
  image?: string;
  image_path?: string;
  tags?: string[];
  extracted_text?: string;
}

export interface Subject {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface AdminSubject {
  id: number;
  name: string;
  icon?: string;
  note_count: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation?: string;
}

export interface Quiz {
  questions: QuizQuestion[];
  title?: string;
}

export interface QuizGenerationRequest {
  content: string;
  title: string;
}

export interface StudyPlan {
  plan: string;
  subject: string;
  topic: string;
}

export interface StudyPlanRequest {
  subject: string;
  topic: string;
}

export interface ConceptExplanation {
  explanation: string;
  concept: string;
  subject?: string;
}

export interface ConceptExplanationRequest {
  concept: string;
  subject?: string;
}

export interface Summary {
  summary: string;
  noteId: number;
}

export interface SummaryRequest {
  content: string;
  title: string;
}

export interface ChatSession {
  id: number;
  subject: string;
  topic: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface ChatDocument {
  id?: number;
  fileName: string;
  documentBase64?: string;
  session_id?: number;
}

export interface LeaderboardEntry {
  id?: number;
  name?: string;
  display_name?: string;
  class?: string;
  points?: number;
  score?: number;
  total_likes?: number;
  photo_url?: string;
  rank?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface NotesResponse {
  notes: Note[];
}

export interface SubjectsResponse {
  subjects: Subject[];
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
}

export interface ChatSessionsResponse {
  sessions: ChatSession[];
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
}

export interface SummaryResponse {
  summary: string;
}

export interface QuizResponse {
  quiz: Quiz;
}

export interface StudyPlanResponse {
  plan: string;
}

export interface ConceptExplanationResponse {
  explanation: string;
}

export interface OCRResponse {
  text: string;
  success: boolean;
}

export interface GradeClass {
  id: number;
  grade: 10 | 11 | 12;
  class_name: string;
  semester: string;
  is_active: number;
  student_count?: number;
}

export interface GradeClassesResponse {
  grade_classes: GradeClass[];
  grouped: Record<number, GradeClass[]>;
}

export interface AppNotification {
  id: number;
  sender_id: number | null;
  target_type: 'all' | 'grade' | 'class' | 'user';
  target_grade?: number;
  target_class?: string;
  target_user_id?: number;
  notification_type: 'announcement' | 'class_reassignment' | 'warning';
  title: string;
  message: string;
  created_at: string;
  is_read: 0 | 1;
  sender_name?: string;
}

export interface NotificationsListResponse {
  notifications: AppNotification[];
}

export interface UnreadCountResponse {
  count: number;
}

export interface AdminUser extends User {
  created_at?: string;
  last_login?: string;
}

export interface AdminNote extends Note {
  reported?: boolean;
  report_count?: number;
}

export interface SuspendUserRequest {
  days: number;
  reason: string;
}

export interface WarnUserRequest {
  message: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SearchParams extends PaginationParams {
  query: string;
  filters?: Record<string, string | number | boolean>;
}

export interface SortParams {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isApiError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
}

// ---- Ops / technical dashboard (Phase 3) ----
export interface OpsHealth {
  status: 'ok' | 'down';
  time: string;
  db?: boolean;
  kv?: boolean;
  ai_configured?: boolean;
  oauth_configured?: boolean;
  latest_migration?: string;
}

export interface OpsMetrics {
  live_users: { m5: number; h1: number; d1: number };
  totals: {
    users: number;
    notes: number;
    suspended_users: number;
    active_warnings: number;
    chat_sessions: number;
    quiz_attempts: number;
  };
  moderation: { soft_deleted_notes: number; featured_notes: number };
  table_rows: { users: number; notes: number; chat_messages: number; study_items: number };
}

export interface OpsTimeseries {
  metric: string;
  points: Array<{ t: string; v: number }>;
}

export interface OpsFlags {
  maintenance: boolean;
  signups: boolean;
  uploads: boolean;
  ai_chat: boolean;
}

// ---- Tier-C Cloudflare platform metrics ----
export interface OpsCloudflareWorkerPoint {
  t: string;
  requests: number;
  errors: number;
  subrequests: number;
  cpuP50: number;
  cpuP99: number;
}

export interface OpsCloudflareD1Point {
  t: string;
  rowsRead: number;
  rowsWritten: number;
  readQueries: number;
  writeQueries: number;
}

export interface OpsCloudflare {
  // false = secrets not set; true (or absent) = configured
  configured?: boolean;
  // false = configured but the CF request/GraphQL failed
  ok?: boolean;
  error?: string;
  workers?: {
    points: OpsCloudflareWorkerPoint[];
    totals: { requests: number; errors: number; subrequests: number };
  };
  d1?: {
    points: OpsCloudflareD1Point[];
    totals: { rowsRead: number; rowsWritten: number; readQueries: number; writeQueries: number };
  };
}
