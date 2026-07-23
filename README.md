![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)

# Notarium

A modern, secure note-sharing platform for students built with React, TypeScript, Cloudflare Workers, and D1 Database.

## Features

- **Notes Management** - Create, share, and organize notes by subject with search functionality
- **AI Study Assistant** - Chat with AI, generate summaries, quizzes, and study plans
- **Gamification** - Earn points and badges, compete on leaderboards
- **OCR Technology** - Upload images and extract text automatically
- **Admin Moderation** - User management and content moderation tools
- **Mobile Responsive** - Full mobile support with touch-optimized interface
- **Enterprise Security** - Bcrypt password hashing, JWT authentication, rate limiting, and more

## Tech Stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS
**Backend:** Cloudflare Workers, Hono, D1 Database
**AI:** DeepSeek for AI chat, summarization, and study assistance
**Auth:** JWT (HS256) with bcrypt password hashing
**Security:** Rate limiting (KV), input validation (Zod), CORS restrictions, security headers

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:5173` for frontend and `http://localhost:8787` for backend.

## Deployment

```bash
# Deploy backend to Cloudflare Workers
npm run deploy:backend

# Deploy frontend to Vercel
vercel
```

## Security

Notarium+ implements enterprise-grade security features:

- **Password Security** - Bcrypt hashing with 10 salt rounds
- **Authentication** - JWT tokens with HS256 signing and 24-hour expiration
- **Rate Limiting** - 5 attempts per 15 minutes using Cloudflare KV
- **Input Validation** - Zod schemas for all user inputs
- **CORS Protection** - Restricted to authorized origins only
- **Security Headers** - CSP, X-Frame-Options, X-Content-Type-Options, etc.
- **Request Size Limits** - 10MB maximum payload size
- **AI Safety** - Prompt injection protection for AI endpoints
- **Environment Secrets** - No hardcoded credentials in source code

For deployment instructions, see [`backend/SECURITY_SETUP.md`](backend/SECURITY_SETUP.md)

## License

Licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Website

Visit us at: https://notarium-site.vercel.app
