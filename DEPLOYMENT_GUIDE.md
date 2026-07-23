# Notarium+ Deployment Guide

## Overview

Notarium+ is ready for deployment to Vercel. This guide walks you through the deployment process.

## Prerequisites

- Node.js 18+ installed
- npm or pnpm package manager
- Vercel CLI (`npm install -g vercel`)
- GitHub/GitLab account (optional but recommended)
- Google Gemini API Key for AI features

## Environment Variables

### Required for Deployment

Set these in your Vercel project settings (Project Settings → Environment Variables):

```
GEMINI_API_KEY=your_actual_gemini_api_key_here
VITE_API_URL=https://notarium-backend.notarium-backend.workers.dev
```

### Optional

```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret_key
```

## Deployment Steps

### 1. Frontend Deployment (Vercel)

**Option A: Direct Vercel CLI**

```bash
cd /path/to/Notarium+
npm install
npm run build:frontend
vercel
```

**Option B: GitHub Integration (Recommended)**

1. Push your code to GitHub
2. Go to https://vercel.com/dashboard
3. Click "Add New" → "Project"
4. Select your GitHub repository
5. Configure build settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
6. Add environment variables in "Environment Variables"
7. Deploy!

### 2. Backend Deployment (Cloudflare Workers)

```bash
cd backend
npm install
npm run deploy
```

This will deploy to Cloudflare Workers at: `https://notarium-backend.workers.dev`

## Features & API Endpoints

### Core Features

✅ **Multi-User Authentication** - JWT-based login/signup
✅ **Note Management** - Create, read, upload notes with OCR
✅ **AI-Powered Study Tools**:

- Auto-Summary (1-sentence summaries on upload)
- Auto-Tags (4-6 relevant tags from content)
- AI Chat (Context-aware study assistant)
- Quiz Generation (Multiple-choice questions)
- Study Plans (7-day personalized plans)
- Concept Explanation (Technical deep-dives)
- OCR Scanning (Extract text from images)

### Available Endpoints

**Public Endpoints:**

- `POST /auth/signup` - User registration
- `POST /auth/login` - User login
- `GET /api/subjects` - Get all subjects (14 Indonesian subjects with icons)

**AI Endpoints:**

- `POST /api/gemini/quick-summary` - 1-sentence summary (for uploads)
- `POST /api/gemini/summarize` - 3-4 sentence detailed summary
- `POST /api/gemini/auto-tags` - Auto-generate topic tags
- `POST /api/gemini/ocr` - Extract text from images
- `POST /api/chat/sessions/{id}/ai-response` - AI chat with context
- `POST /api/gemini/analyze-notes` - Study guidance from notes

**Admin-Only Endpoints:**

- Upvote notes (for admins only)
- User management (suspend/delete)
- Note moderation

## Testing Locally

```bash
# Terminal 1: Start Backend
cd backend
npm run dev

# Terminal 2: Start Frontend
npm run dev:frontend
```

Frontend will run on: `http://localhost:5173`
Backend will run on: `http://localhost:8787`

## Testing Deployed Version

Once deployed to Vercel, test the following:

1. **Authentication Flow**
   - Sign up with test account
   - Login with credentials
   - Verify JWT token in localStorage

2. **Subject Display**
   - Should show 14 Indonesian subjects in 3-column grid
   - Icons should render with FontAwesome
   - SpaceX dark theme should be applied

3. **Note Upload**
   - Upload note with image (supports OCR)
   - Auto-summary should generate (1 sentence)
   - Auto-tags should generate (4-6 tags)
   - Tags should appear below title in notes list

4. **AI Features**
   - Click "Generate AI Summary" button
   - Should call `/api/gemini/summarize`
   - Display 3-4 sentence summary
   - Like button should work

5. **Admin Features**
   - Login with admin account (if available)
   - Admin Upvote button should appear on notes
   - Regular users should NOT see the upvote button

## Deployment Checklist

- [ ] All environment variables set in Vercel
- [ ] GEMINI_API_KEY is valid and has appropriate quota
- [ ] Backend URL is correct in VITE_API_URL
- [ ] Frontend builds successfully (`npm run build`)
- [ ] All API endpoints responding correctly
- [ ] Admin features restricted to admins only
- [ ] Auto-summary and auto-tags working
- [ ] Theme (SpaceX dark) loads correctly
- [ ] Responsive design works on mobile
- [ ] No console errors in browser DevTools

## Troubleshooting

### 404 API Errors

**Issue:** Frontend can't reach backend API
**Solution:**

- Check VITE_API_URL environment variable
- Ensure backend is deployed and running
- Check CORS settings on backend

### Summarize Button Not Working

**Issue:** `/api/gemini/summarize` returns 404
**Solution:**

- Ensure backend is running
- Verify GEMINI_API_KEY is set in backend
- Check backend logs for errors

### Admin Features Not Showing

**Issue:** Upvote button doesn't appear
**Solution:**

- Verify user has admin role in database
- Check isAdmin calculation in NoteDetailModal.tsx
- Admin users must have email ending with @notarium.site OR role='admin'

### Build Fails on Vercel

**Issue:** `vite build` command fails
**Solution:**

- Check Node version compatibility (needs 18+)
- Ensure all dependencies installed: `npm install`
- Check for TypeScript errors: `npx tsc --noEmit`

## Production Best Practices

1. **Environment Security**
   - Never commit `.env` files
   - Use Vercel's environment variable UI
   - Rotate API keys periodically

2. **Performance**
   - Monitor bundle size (currently ~83KB gzipped)
   - Enable caching for static assets
   - Use CDN for images

3. **Monitoring**
   - Set up Vercel Analytics
   - Monitor Cloudflare Workers usage
   - Track API error rates

4. **Scaling**
   - Backend auto-scales on Cloudflare
   - Frontend served via Vercel's global CDN
   - Database (D1) includes automatic backups

## Support & Resources

- **Notarium+ Repository**: GitHub link
- **Vercel Docs**: https://vercel.com/docs
- **Cloudflare Workers**: https://workers.cloudflare.com/
- **Google Gemini API**: https://ai.google.dev/

## Next Steps

1. Set environment variables in Vercel
2. Deploy frontend to Vercel
3. Deploy backend to Cloudflare Workers
4. Test all features in production
5. Configure custom domain (optional)
6. Set up monitoring and analytics
