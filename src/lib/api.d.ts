declare module './lib/api' {
  import type {
    User,
    LoginResponse,
    LoginCredentials,
    SignupData,
    ProfileUpdateData,
    Note,
    CreateNoteData,
    Subject,
    NotesResponse,
    SubjectsResponse,
    RequestOptions,
  } from '../types';

  export const api: {
    request<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T>;
    auth: {
      signup(data: SignupData): Promise<LoginResponse>;
      login(credentials: LoginCredentials): Promise<LoginResponse>;
      adminLogin(credentials: LoginCredentials): Promise<LoginResponse>;
    };
    notes: {
      getAll(): Promise<NotesResponse>;
      create(note: CreateNoteData): Promise<Note>;
    };
    subjects: {
      getAll(): Promise<SubjectsResponse>;
    };
    getCurrentUser(): Promise<User>;
    updateProfile(data: ProfileUpdateData): Promise<User>;
  };

  export default api;
  export type { User, LoginResponse, LoginCredentials };
}
