/**
 * Zod request schemas shared across route handlers.
 */
import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  class: z.string().max(50).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const noteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100000),
  subject_id: z.number().int().positive(),
  description: z.string().max(500).optional(),
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000),
});

export const profileUpdateSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  class: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  photo_url: z.string().url().max(500).optional(),
});
