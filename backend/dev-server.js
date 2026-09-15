import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const app = express();
const port = 8787;

// Get Gemini API Key from environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) console.warn('GEMINI_API_KEY not set — AI routes will return their error fallback');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Mock database
const mockUsers = new Map();
const mockSessions = new Map();
const mockMessages = new Map();
let sessionCounter = 1;
let messageCounter = 1;

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

// Helper to get or create user
function getOrCreateUser(userId) {
  if (!mockUsers.has(userId)) {
    mockUsers.set(userId, {
      id: mockUsers.size + 1,
      encrypted_yw_id: userId,
      display_name: 'Student ' + mockUsers.size,
      email: `student${mockUsers.size}@test.com`,
      class: '10-A',
      role: 'student',
      notes_uploaded: 0,
      total_likes: 0,
      total_admin_upvotes: 0,
      created_at: new Date().toISOString(),
    });
  }
  return mockUsers.get(userId);
}

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
    id: mockUsers.size + 1,
    email,
    name,
    class: userClass || '10-A',
    role: 'student',
    points: 0,
    notes_count: 0,
  };

  // Mock JWT token
  const token = 'mock-token-' + Date.now();

  res.json({
    success: true,
    user,
    token
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  // Check if admin login
  const isAdmin = email.endsWith('@notarium.site');
  if (isAdmin && password !== 'notariumanagers') {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const user = {
    id: Math.floor(Math.random() * 1000),
    email,
    name: isAdmin ? 'Administrator' : email.split('@')[0],
    class: isAdmin ? 'Admin' : '10-A',
    role: isAdmin ? 'admin' : 'student',
    points: 0,
    notes_count: 0,
  };

  // Mock JWT token
  const token = 'mock-token-' + Date.now();

  res.json({
    success: true,
    user,
    token
  });
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

// Get current user
app.get('/api/user/me', (req, res) => {
  const userId = req.headers['x-encrypted-yw-id'];
  if (!userId) {
    return res.status(400).json({ error: 'User ID not found' });
  }
  const user = getOrCreateUser(userId);
  res.json({ user });
});

// Update user info
app.post('/api/user/update', (req, res) => {
  const userId = req.headers['x-encrypted-yw-id'];
  const { display_name, photo_url, email } = req.body;
  const user = getOrCreateUser(userId);
  Object.assign(user, { display_name, photo_url, email });
  res.json({ success: true });
});

// Update user class
app.put('/api/user/class', (req, res) => {
  const userId = req.headers['x-encrypted-yw-id'];
  const { class: userClass } = req.body;
  const user = getOrCreateUser(userId);
  user.class = userClass;
  res.json({ success: true });
});

// Get all subjects
app.get('/api/subjects', (req, res) => {
  res.json({ subjects: mockSubjects });
});

// Get notes by subject
app.get('/api/notes/subject/:subjectId', (req, res) => {
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

// Search notes
app.get('/api/notes/search', (req, res) => {
  res.json({ notes: [] });
});

// Create note
app.post('/api/notes', (req, res) => {
  const userId = req.headers['x-encrypted-yw-id'];
  const user = getOrCreateUser(userId);
  const { title, description, subject_id } = req.body;

  res.json({
    note: {
      id: Math.random() * 1000,
      title,
      description,
      author_id: user.id,
      subject_id,
      likes: 0,
      created_at: new Date().toISOString(),
    }
  });
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  res.json({
    leaderboard: [
      {
        encrypted_yw_id: 'user-1',
        display_name: 'Top Student',
        email: 'top@test.com',
        notes_uploaded: 15,
        total_likes: 50,
        total_admin_upvotes: 5,
        score: 300,
      },
    ]
  });
});

// Create chat session
app.post('/api/chat/sessions', (req, res) => {
  const userId = req.headers['x-encrypted-yw-id'];
  const user = getOrCreateUser(userId);
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
  const userId = req.headers['x-encrypted-yw-id'];
  const user = getOrCreateUser(userId);
  const sessions = Array.from(mockSessions.values()).filter(s => s.user_id === user.id);
  res.json({ sessions });
});

// Get chat messages
app.get('/api/chat/sessions/:sessionId/messages', (req, res) => {
  const messages = mockMessages.get(parseInt(req.params.sessionId)) || [];
  res.json({ messages });
});

// Add chat message with Gemini AI response
app.post('/api/chat/sessions/:sessionId/messages', async (req, res) => {
  const { role, content } = req.body;
  const sessionId = parseInt(req.params.sessionId);

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
  const { message, subject } = req.body;
  const sessionId = parseInt(req.params.sessionId);
  const userId = req.headers['x-encrypted-yw-id'];

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

// Like note
app.post('/api/notes/:noteId/like', (req, res) => {
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
  res.json({ success: true, isAdmin: true });
});

app.get('/api/admin/users', (req, res) => {
  res.json({ users: Array.from(mockUsers.values()) });
});

app.get('/api/admin/notes', (req, res) => {
  res.json({ notes: [] });
});

app.listen(port, () => {
  console.log(`✅ Mock Backend running on http://localhost:${port}`);
  console.log(`📝 This is a development mock server`);
  console.log(`🚀 For production, deploy to Cloudflare Workers with: npm run deploy`);
});
