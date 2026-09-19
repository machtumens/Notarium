import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const app = express();
const port = 8787;

// Get Gemini API Key from environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) console.warn('GEMINI_API_KEY not set — AI routes will return their error fallback');

// Admin password comes from the environment like the Worker's ADMIN_PASSWORD secret;
// when it is unset, admin login and /api/admin/verify are disabled (401).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD not set — admin login is disabled in the mock');
function isAdminCredential(email, password) {
  return Boolean(ADMIN_PASSWORD) && typeof email === 'string' && email.endsWith('@notarium.site') && password === ADMIN_PASSWORD;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Mock database
const mockSessions = new Map();
const mockMessages = new Map();
let sessionCounter = 1;
let messageCounter = 1;

// Bearer-token identity, mirroring the Worker since W1.4 (no X-Encrypted-Yw-ID fallback)
const mockTokens = new Map(); // token -> user
let nextUserId = 1000; // accounts from signup/login get unique ids so ownership checks mean something
const mockNotes = []; // notes created through POST /api/notes (served by /api/notes/my-notes)
let noteCounter = 1;

// Access tokens expire after 15 minutes like the Worker's JWTs (W2.1); the refresh token mints the next one.
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const mockTokenExpiry = new Map(); // token -> epoch ms

function issueToken(user) {
  const token = 'mock-token-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  mockTokens.set(token, user);
  mockTokenExpiry.set(token, Date.now() + ACCESS_TOKEN_TTL_MS);
  return token;
}

// Refresh tokens (W2.1 parity): one family per sign-in, rotated on every use; a replayed
// (already rotated) token retires its whole family; logout revokes. In-memory only.
const mockRefreshTokens = new Map(); // refreshToken -> { user, family, expiresAt, revoked }
let familyCounter = 1;

function issueRefreshToken(user, family = 'family-' + familyCounter++) {
  const refreshToken = randomBytes(32).toString('base64url');
  mockRefreshTokens.set(refreshToken, { user, family, expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS, revoked: false });
  return refreshToken;
}

function issueSession(user) {
  return { token: issueToken(user), refreshToken: issueRefreshToken(user) };
}

function revokeRefreshFamily(family) {
  for (const row of mockRefreshTokens.values()) {
    if (row.family === family) row.revoked = true;
  }
}

// Same per-IP bucket as the Worker's /api/auth/refresh: 5 attempts per 15 minutes → 429
const REFRESH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };
const refreshAttempts = new Map(); // ip -> [epoch ms]
function refreshAllowed(ip) {
  const now = Date.now();
  const recent = (refreshAttempts.get(ip) || []).filter((t) => t > now - REFRESH_RATE_LIMIT.windowMs);
  if (recent.length >= REFRESH_RATE_LIMIT.max) return false;
  refreshAttempts.set(ip, [...recent, now]);
  return true;
}

// 401 unless the request carries a live token issued by this mock's signup/login
function requireUser(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  const user = token ? mockTokens.get(token) : null;
  if (!user || (mockTokenExpiry.get(token) ?? 0) <= Date.now()) {
    res.status(401).json({ error: 'Unauthorized - Invalid or missing token' });
    return null;
  }
  return user;
}

// Mirrors the Worker's chat gate: 401 no token, 404 unknown session, 403 not the owner
function requireOwnedSession(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  const session = mockSessions.get(parseInt(req.params.sessionId));
  if (!session) {
    res.status(404).json({ error: 'Chat session not found' });
    return null;
  }
  if (session.user_id !== user.id) {
    res.status(403).json({ error: 'Unauthorized - Not your chat session' });
    return null;
  }
  return { user, session };
}

// Indonesian school subjects with FontAwesome icons
const mockSubjects = [
  { id: 1, name: 'Filsafat', icon: 'fa-brain', note_count: 0 },
  { id: 2, name: 'Fisika', icon: 'fa-atom', note_count: 0 },
  { id: 3, name: 'Matematika', icon: 'fa-square-root-variable', note_count: 0 },
  { id: 4, name: 'Bahasa Indonesia', icon: 'fa-language', note_count: 0 },
  { id: 5, name: 'Bahasa Inggris', icon: 'fa-language', note_count: 0 },
  { id: 6, name: 'Sosiologi', icon: 'fa-users', note_count: 0 },
  { id: 7, name: 'Sejarah Indonesia', icon: 'fa-landmark', note_count: 0 },
  { id: 8, name: 'Geografi', icon: 'fa-globe-americas', note_count: 0 },
  { id: 9, name: 'Ekonomi', icon: 'fa-chart-line', note_count: 0 },
  { id: 10, name: 'Sains', icon: 'fa-flask', note_count: 0 },
  { id: 11, name: 'PKN', icon: 'fa-flag', note_count: 0 },
  { id: 12, name: 'PAK', icon: 'fa-church', note_count: 0 },
  { id: 13, name: 'Biologi', icon: 'fa-dna', note_count: 0 },
  { id: 14, name: 'Kimia', icon: 'fa-vial', note_count: 0 },
];

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Notarium Backend API is running (Mock Mode for Local Development)!',
    mode: 'development',
    database: 'mock'
  });
});

// Auth endpoints
app.post('/api/auth/signup', (req, res) => {
  const { email, password, name, class: userClass } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const user = {
    id: nextUserId++,
    email,
    name,
    class: userClass || '10-A',
    role: 'student',
    points: 0,
    notes_count: 0,
  };

  // Mock JWT + refresh token
  const { token, refreshToken } = issueSession(user);

  res.json({
    success: true,
    user,
    token,
    refreshToken
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  // Admin login: env-based password, disabled when ADMIN_PASSWORD is unset
  const isAdmin = email.endsWith('@notarium.site');
  if (isAdmin && !isAdminCredential(email, password)) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const user = {
    id: nextUserId++,
    email,
    name: isAdmin ? 'Administrator' : email.split('@')[0],
    class: isAdmin ? 'Admin' : '10-A',
    role: isAdmin ? 'admin' : 'student',
    points: 0,
    notes_count: 0,
  };

  // Mock JWT + refresh token
  const { token, refreshToken } = issueSession(user);

  res.json({
    success: true,
    user,
    token,
    refreshToken
  });
});

// Rotate a refresh token → {token, refreshToken}; every failure is 401 with one message (Worker parity)
app.post('/api/auth/refresh', (req, res) => {
  if (!refreshAllowed(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'Too many refresh attempts. Please try again in 15 minutes.' });
  }
  const presented = req.body?.refreshToken;
  if (typeof presented !== 'string' || presented.length === 0 || presented.length > 512) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  const denied = () => res.status(401).json({ error: 'Invalid or expired refresh token' });
  const row = mockRefreshTokens.get(presented);
  if (!row) return denied();
  if (row.revoked) {
    revokeRefreshFamily(row.family); // replay → the whole family is gone
    return denied();
  }
  if (row.expiresAt <= Date.now()) return denied();
  row.revoked = true;
  res.json({ token: issueToken(row.user), refreshToken: issueRefreshToken(row.user, row.family) });
});

// Revoke the presented token's family (when it is the caller's), or every refresh token of the caller
app.post('/api/auth/logout', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const presented = req.body?.refreshToken;
  if (typeof presented === 'string' && presented.length > 0) {
    const row = mockRefreshTokens.get(presented);
    if (row && row.user.id === user.id) revokeRefreshFamily(row.family);
  } else {
    for (const row of mockRefreshTokens.values()) {
      if (row.user.id === user.id) row.revoked = true;
    }
  }
  res.json({ success: true });
});

app.post('/api/auth/verify', (req, res) => {
  res.json({ success: true, authenticated: true });
});

// Get current authenticated user (from token/headers)
app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Mock user data based on token
  const user = {
    id: Math.floor(Math.random() * 1000),
    email: 'user@test.com',
    name: 'Test User',
    class: '10-A',
    role: 'student',
    points: 0,
    notes_count: 0,
  };

  res.json({ user });
});

// Get current user (bearer token, like the Worker since W1.4)
app.get('/api/user/me', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ user });
});

// Update user info — only the given fields change; email is not writable (W1.14)
app.post('/api/user/update', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const { display_name, name, photo_url, class: userClass, description } = req.body || {};
  const updates = {};
  if (display_name !== undefined || name !== undefined) updates.display_name = display_name ?? name;
  if (photo_url !== undefined) updates.photo_url = photo_url;
  if (userClass !== undefined) updates.class = userClass;
  if (description !== undefined) updates.description = description;
  Object.assign(user, updates);
  res.json({ success: true, updated: Object.keys(updates).length > 0 });
});

// Update user class
app.put('/api/user/class', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  user.class = req.body?.class;
  res.json({ success: true });
});

// Get all subjects
app.get('/api/subjects', (req, res) => {
  res.json({ subjects: mockSubjects });
});

// Get notes by subject (bearer token required, like the Worker)
app.get('/api/notes/subject/:subjectId', (req, res) => {
  if (!requireUser(req, res)) return;
  res.json({
    notes: [
      {
        id: 1,
        title: 'Algebra Basics',
        description: 'Learn the fundamentals of algebra',
        author_name: 'Student 1',
        author_photo: null,
        subject_id: 1,
        likes: 5,
        created_at: new Date().toISOString(),
      },
    ]
  });
});

// Search notes (bearer token required, like the Worker)
app.get('/api/notes/search', (req, res) => {
  if (!requireUser(req, res)) return;
  res.json({ notes: [] });
});

// Create note
app.post('/api/notes', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const { title, description, content, subject_id, tags, status, visibility } = req.body;
  if (!title || !subject_id) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const note = {
    id: noteCounter++,
    title,
    description: description || 'No description',
    content: content || description || '',
    extracted_text: '',
    summary: description || '',
    tags: JSON.stringify(tags || []),
    author_id: user.id,
    author_name: user.name || user.display_name,
    subject_id,
    subject_name: (mockSubjects.find(s => s.id === subject_id) || {}).name,
    likes: 0,
    admin_upvotes: 0,
    status: status === 'draft' ? 'draft' : 'published',
    visibility: visibility || 'everyone',
    created_at: new Date().toISOString(),
  };
  mockNotes.push(note);

  res.json({ note, notes: [note], success: true, totalParts: 1 });
});

// The caller's own notes — same field set the Worker returns after W1.7
// (content, description, author_name included)
app.get('/api/notes/my-notes', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const statusFilter = req.query.status;
  const notes = mockNotes.filter(n => n.author_id === user.id && (!statusFilter || n.status === statusFilter));
  res.json({ notes });
});

// Get leaderboard — the public scoreboard shape the Worker returns since W1.5
// (no email, no encrypted_yw_id, no photo_url; `points`, not `score`)
app.get('/api/leaderboard', (req, res) => {
  res.json({
    leaderboard: [
      {
        display_name: 'Top Student',
        class: '10.1',
        notes_uploaded: 15,
        total_likes: 50,
        total_admin_upvotes: 5,
        points: 70,
      },
    ]
  });
});

// Create chat session
app.post('/api/chat/sessions', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const { subject, topic } = req.body;

  const sessionId = sessionCounter++;
  const session = {
    id: sessionId,
    user_id: user.id,
    subject,
    topic,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  mockSessions.set(sessionId, session);
  res.json({ session });
});

// Get chat sessions
app.get('/api/chat/sessions', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const sessions = Array.from(mockSessions.values()).filter(s => s.user_id === user.id);
  res.json({ sessions });
});

// Get chat messages
app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
  if (!requireOwnedSession(req, res)) return;
  const messages = mockMessages.get(parseInt(req.params.sessionId)) || [];
  res.json({ messages });
});

// Add chat message with Gemini AI response
app.post('/api/chat/sessions/:sessionId/messages', async (req, res) => {
  if (!requireOwnedSession(req, res)) return;
  const { role, content } = req.body;
  const sessionId = parseInt(req.params.sessionId);
  if (!['user', 'assistant'].includes(role) || typeof content !== 'string' || content.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const message = {
    id: messageCounter++,
    session_id: sessionId,
    role,
    content,
    created_at: new Date().toISOString(),
  };

  if (!mockMessages.has(sessionId)) {
    mockMessages.set(sessionId, []);
  }
  mockMessages.get(sessionId).push(message);

  // Get AI response if user message
  if (role === 'user') {
    try {
      const session = mockSessions.get(sessionId);
      const conversationHistory = mockMessages.get(sessionId) || [];

      // Build conversation context in correct Gemini API format
      const messages = conversationHistory.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{
          text: m.content
        }]
      }));

      const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

      const systemPrompt = `You are an expert study tutor trained to help students learn effectively. Your role is to:
1. Answer questions about ${session?.subject || 'various'} topics with clear, educational explanations
2. Break down complex concepts into easy-to-understand parts
3. Provide study tips and learning strategies
4. Create quiz questions and practice problems when requested
5. Suggest study resources and techniques
6. Help students prepare for exams
7. Explain concepts from multiple angles if needed
8. Encourage critical thinking and deeper understanding

When analyzing documents or notes provided by students:
- Summarize the key concepts
- Identify important formulas or definitions
- Create study questions based on the material
- Point out connections to related topics
- Suggest areas that need more practice

Always be encouraging, patient, and adapt your teaching style to the student's level.`;

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: systemPrompt
            }]
          },
          contents: messages
        })
      });

      const data = await response.json();

      if (response.ok && data.candidates && data.candidates[0]) {
        const aiContent = data.candidates[0].content.parts[0].text;
        const aiMessage = {
          id: messageCounter++,
          session_id: sessionId,
          role: 'assistant',
          content: aiContent,
          created_at: new Date().toISOString(),
        };
        mockMessages.get(sessionId).push(aiMessage);
        res.json({ message, ai_response: aiMessage });
      } else {
        console.error('Gemini API Error:', data);
        const fallbackMessage = {
          id: messageCounter++,
          session_id: sessionId,
          role: 'assistant',
          content: `I'm having trouble connecting to my AI system right now. Please try again in a moment.`,
          created_at: new Date().toISOString(),
        };
        mockMessages.get(sessionId).push(fallbackMessage);
        res.json({ message, ai_response: fallbackMessage });
      }
    } catch (error) {
      console.error('Chat Error:', error);
      const fallbackMessage = {
        id: messageCounter++,
        session_id: sessionId,
        role: 'assistant',
        content: `Sorry, I encountered an error. Please try again.`,
        created_at: new Date().toISOString(),
      };
      if (!mockMessages.has(sessionId)) {
        mockMessages.set(sessionId, []);
      }
      mockMessages.get(sessionId).push(fallbackMessage);
      res.json({ message, ai_response: fallbackMessage });
    }
  } else {
    res.json({ message });
  }
});

// Get AI response for message
app.post('/api/chat/sessions/:sessionId/ai-response', async (req, res) => {
  if (!requireOwnedSession(req, res)) return;
  const { message, subject } = req.body;
  const sessionId = parseInt(req.params.sessionId);

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const session = mockSessions.get(sessionId);
    const conversationHistory = mockMessages.get(sessionId) || [];

    // Build conversation context in correct Gemini API format
    const messages = conversationHistory.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{
        text: m.content
      }]
    }));

    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const systemPrompt = `You are an expert study tutor trained to help students learn effectively. Your role is to:
1. Answer questions about ${subject || session?.subject || 'various'} topics with clear, educational explanations
2. Break down complex concepts into easy-to-understand parts
3. Provide study tips and learning strategies
4. Create quiz questions and practice problems when requested
5. Suggest study resources and techniques
6. Help students prepare for exams
7. Explain concepts from multiple angles if needed
8. Encourage critical thinking and deeper understanding

Always be encouraging, patient, and adapt your teaching style to the student's level.`;

    // Add user message to conversation
    const updatedMessages = [...messages, {
      role: 'user',
      parts: [{ text: message }]
    }];

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: systemPrompt
          }]
        },
        contents: updatedMessages
      })
    });

    const data = await response.json();

    if (response.ok && data.candidates && data.candidates[0]) {
      const aiContent = data.candidates[0].content.parts[0].text;

      // Save user message
      if (!mockMessages.has(sessionId)) {
        mockMessages.set(sessionId, []);
      }
      mockMessages.get(sessionId).push({
        id: messageCounter++,
        session_id: sessionId,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      });

      // Save AI message
      mockMessages.get(sessionId).push({
        id: messageCounter++,
        session_id: sessionId,
        role: 'assistant',
        content: aiContent,
        created_at: new Date().toISOString(),
      });

      res.json({ response: aiContent });
    } else {
      console.error('Gemini API Error:', data);
      res.json({ response: 'I apologize, but I encountered an error. Please try again.' });
    }
  } catch (error) {
    console.error('AI Response Error:', error);
    res.status(500).json({ error: error.message || 'Failed to get AI response' });
  }
});

// Like note (bearer token required, like the Worker)
app.post('/api/notes/:noteId/like', (req, res) => {
  if (!requireUser(req, res)) return;
  res.json({ liked: true });
});

// Auto-generate tags from note content
app.post('/api/gemini/auto-tags', async (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Generate 4-6 relevant tags for this study note. Tags should be:
- Single words or short phrases (lowercase, hyphenated if needed)
- Based on topics, concepts, and skills covered
- Useful for sorting and categorization
- Separated by commas

Title: ${title}

Content: ${content}

Respond with ONLY the comma-separated tags, no other text. Example format: algebra, equations, polynomials, graphing, solving-equations`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok || !data.candidates || !data.candidates[0]) {
      console.error('Gemini API Error:', data);
      // Return generic tags based on title if API fails
      const defaultTags = title.toLowerCase().split(/\s+/).slice(0, 3);
      return res.json({
        success: false,
        tags: defaultTags
      });
    }

    const tagsString = data.candidates[0].content.parts[0].text.trim();
    const tags = tagsString
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0 && tag.length < 30);

    res.json({
      success: true,
      tags: tags.slice(0, 6) // Limit to 6 tags max
    });
  } catch (error) {
    console.error('Auto-tags Error:', error);
    // Return generic tags as fallback
    const defaultTags = title.toLowerCase().split(/\s+/).slice(0, 3);
    res.json({
      success: false,
      tags: defaultTags
    });
  }
});

// Quick 1-sentence summary for note recognition
app.post('/api/gemini/quick-summary', async (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Create a SINGLE sentence summary of this study note that helps students quickly identify the topic. The summary should be clear, concise, and informative (15-25 words max).\n\nTitle: ${title}\n\nContent:\n${content}\n\nRespond with ONLY the 1-sentence summary, no extra text.`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok || !data.candidates || !data.candidates[0]) {
      console.error('Gemini API Error:', data);
      return res.json({
        success: false,
        summary: `This note covers ${title}`
      });
    }

    const summary = data.candidates[0].content.parts[0].text.trim();

    res.json({
      success: true,
      summary: summary
    });
  } catch (error) {
    console.error('Quick Summary Error:', error);
    res.json({
      success: false,
      summary: `This note covers ${title}`
    });
  }
});

// Summarize note with Gemini API (longer summary)
app.post('/api/gemini/summarize', async (req, res) => {
  const { title, description, content } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  try {
    const fullContent = content ? `${description}\n\n${content}` : description;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Provide a concise, clear summary of the following study note in 3-4 sentences. Focus on the key concepts and takeaways:\n\nTitle: ${title}\n\nContent:\n${fullContent}`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok || !data.candidates || !data.candidates[0]) {
      console.error('Gemini API Error:', data);
      return res.status(400).json({
        success: false,
        error: 'Failed to generate summary',
        details: data.error?.message || 'Unknown error'
      });
    }

    const summary = data.candidates[0].content.parts[0].text;

    res.json({
      success: true,
      summary: summary
    });
  } catch (error) {
    console.error('Summary Generation Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate summary',
      details: error.message
    });
  }
});

// OCR - Process image with Google Cloud Vision API
app.post('/api/gemini/ocr', async (req, res) => {
  const { imageBase64, mimeType } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const CLOUD_VISION_API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY || process.env.GEMINI_API_KEY;

  try {
    // Clean base64 string
    let base64Data = imageBase64;
    if (imageBase64.includes(',')) {
      base64Data = imageBase64.split(',')[1];
    }

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${CLOUD_VISION_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{
          image: {
            content: base64Data
          },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION',
            maxResults: 1
          }]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || 'Unknown Cloud Vision error';
      console.error('Cloud Vision API Error:', data);
      return res.status(400).json({
        success: false,
        error: 'Failed to process image',
        details: errorMessage
      });
    }

    if (data.responses && data.responses[0]) {
      const textAnnotations = data.responses[0].textAnnotations;
      if (textAnnotations && textAnnotations.length > 0) {
        // First annotation contains all the text
        const extractedText = textAnnotations[0].description;
        res.json({
          success: true,
          text: extractedText
        });
      } else if (data.responses[0].fullTextAnnotation) {
        res.json({
          success: true,
          text: data.responses[0].fullTextAnnotation.text
        });
      } else {
        // No text found in image
        res.json({
          success: true,
          text: ''
        });
      }
    } else {
      console.error('Invalid Cloud Vision response:', data);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from Cloud Vision API'
      });
    }
  } catch (error) {
    console.error('OCR Processing Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process image',
      details: error.message
    });
  }
});

// Analyze notes for chat context
app.post('/api/chat/analyze-notes', async (req, res) => {
  const { subject, topic } = req.body;

  if (!subject) {
    return res.status(400).json({ error: 'subject is required' });
  }

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  try {
    // For now, return mock analyzed notes
    // In production, this would fetch actual notes from database and analyze them
    const analysisPrompt = `Analyze these study notes from ${subject}${topic ? ` on the topic of ${topic}` : ''}:

- Note 1: Introduction and fundamentals
- Note 2: Advanced concepts and applications
- Note 3: Practice problems and solutions

Key concepts to focus on:
1. Core definitions and principles
2. Common misconceptions
3. Practice areas
4. Real-world applications

Provide a brief analysis of what the student should focus on to master this material.`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: analysisPrompt
          }]
        }]
      })
    });

    const data = await response.json();

    if (response.ok && data.candidates && data.candidates[0]) {
      const analysis = data.candidates[0].content.parts[0].text;
      res.json({
        success: true,
        analysis: analysis,
        subject: subject,
        topic: topic
      });
    } else {
      res.json({
        success: false,
        analysis: `Here are the available notes in ${subject}. I'll help you understand them better. What would you like to focus on?`,
        subject: subject,
        topic: topic
      });
    }
  } catch (error) {
    console.error('Analysis Error:', error);
    res.json({
      success: false,
      analysis: `I can help you study ${subject}. Feel free to upload documents, ask questions, or request practice problems.`,
      subject: subject,
      topic: topic
    });
  }
});

// Upload study document for analysis
app.post('/api/chat/upload-document', (req, res) => {
  const { documentBase64, fileName, sessionId } = req.body;

  if (!documentBase64 || !fileName) {
    return res.status(400).json({ error: 'documentBase64 and fileName are required' });
  }

  // Mock document processing
  const documentInfo = {
    id: Math.floor(Math.random() * 10000),
    filename: fileName,
    uploadedAt: new Date().toISOString(),
    size: documentBase64.length,
    status: 'processed'
  };

  res.json({
    success: true,
    document: documentInfo,
    message: `Document "${fileName}" has been uploaded and analyzed. I can now help you study from this material.`
  });
});

// Admin endpoints
app.post('/api/admin/verify', (req, res) => {
  const { email, password } = req.body || {};
  if (!isAdminCredential(email, password)) {
    return res.status(401).json({ success: false, isAdmin: false, error: 'Invalid credentials' });
  }
  res.json({ success: true, isAdmin: true });
});

app.get('/api/admin/users', (req, res) => {
  // every account this mock has issued a token for (unique by id)
  const users = Array.from(new Map(Array.from(mockTokens.values()).map((u) => [u.id, u])).values());
  res.json({ users });
});

app.get('/api/admin/notes', (req, res) => {
  res.json({ notes: [] });
});

app.listen(port, () => {
  console.log(`✅ Mock Backend running on http://localhost:${port}`);
  console.log(`📝 This is a development mock server`);
  console.log(`🚀 For production, deploy to Cloudflare Workers with: npm run deploy`);
});
