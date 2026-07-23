/**
 * AI integrations: DeepSeek chat/summary/quiz/plan/explain + Google Cloud Vision OCR.
 * Uses REST APIs directly (not the @google/generative-ai SDK) for Workers compatibility.
 * API keys are read exclusively from env bindings — no hardcoded fallbacks.
 */
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getUserFromToken } from '../lib/auth';

// Get user's notes for context
export async function getUserNotes(userId: number, subject?: string, env?: Env): Promise<any[]> {
  if (!env) return [];

  let query =
    'SELECT id, title, description, subject_id, extracted_text, summary FROM notes WHERE author_id = ?';
  const params: any[] = [userId];

  if (subject) {
    query += ' AND subject_id = (SELECT id FROM subjects WHERE name = ?)';
    params.push(subject);
  }

  query += ' LIMIT 10';

  try {
    const { results } = await env.DB.prepare(query)
      .bind(...params)
      .all();
    return results || [];
  } catch (e) {
    return [];
  }
}

// Format notes for Gemini context - uses AI-cleaned extracted text as knowledge base
export function formatNotesForContext(notes: any[]): string {
  if (notes.length === 0) {
    return '';
  }

  const notesSummary = notes
    .map((note, idx) => {
      // Prioritize extracted_text (Gemini-cleaned OCR) for accurate content
      const content = note.extracted_text || note.description || note.title;
      return `[Note ${idx + 1}] ${note.title}\n${content?.substring(0, 1200) || '(No content)'}`;
    })
    .join('\n\n---\n\n');

  return `\n\n📚 KNOWLEDGE BASE (User's Study Materials - PRIMARY SOURCE):\n${notesSummary}\n\n⚠️ CRITICAL INSTRUCTIONS:
- You MUST derive AT LEAST 60% of your answer directly from the Knowledge Base above
- Quote and reference specific information from the notes when available
- Only use general knowledge to supplement or clarify when the notes don't fully cover the question
- If the answer is in the notes, cite it explicitly
- Use the exact terminology and concepts from the user's study materials`;
}

// Chat with DeepSeek AI using note context - Automatically feeds AI-cleaned note content as knowledge base
export async function chatWithGemini(
  sessionId: string,
  userMessage: string,
  subject: string,
  userId: number,
  request: Request,
  env: Env,
) {
  try {
    // Get user's notes for context - includes DeepSeek-cleaned extracted text from OCR
    const userNotes = await getUserNotes(userId, subject, env);
    const notesContext = formatNotesForContext(userNotes);

    // Get chat history (reduced from 20 to 8 for faster responses)
    const { results: messages } = await env.DB.prepare(
      `
      SELECT role, content FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 8
    `,
    )
      .bind(sessionId)
      .all();

    const reverseMessages = (messages || []).reverse();

    // Build conversation history for DeepSeek
    const conversationHistory = reverseMessages.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Add system message at the beginning
    const allMessages = [
      {
        role: 'system',
        content: `You are a helpful study assistant. Respond concisely and clearly.

FORMAT:
- Use markdown: **bold**, *italic*, \`code\`
- Add emojis for engagement: ✅ ❌ 📚 💡 🎯
- Use bullet points and numbered lists
- Keep responses focused and brief

CONTENT:
- Prioritize user's study materials when available
- Reference notes with "berdasarkan catatan kamu"
- Be concise - quality over quantity
- Respond in Indonesian (Bahasa Indonesia)`,
      },
      ...conversationHistory,
    ];

    // Send message with knowledge base context (invisible to user but feeds the AI)
    const contextualMessage = notesContext ? `${userMessage}${notesContext}` : userMessage;

    allMessages.push({
      role: 'user',
      content: contextualMessage,
    });

    const deepseekApiKey = env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      throw new Error('AI service not configured');
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: allMessages,
        max_tokens: 1024, // Reduced from 2048 for faster responses
        temperature: 0.8, // Slightly higher for faster generation
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const aiResponse = data.choices[0].message.content.trim();

    // Save AI response to database
    await env.DB.prepare(
      `
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (?, ?, ?)
    `,
    )
      .bind(sessionId, 'assistant', aiResponse)
      .run();

    return aiResponse;
  } catch (error: any) {
    throw new Error(`Failed to get AI response: ${error.message}`);
  }
}

// OCR using Google Cloud Vision API + Gemini 2.0 for text formatting
export async function performOCR(imageBase64: string, mimeType: string, env: Env) {
  try {
    const apiKey = env.GOOGLE_CLOUD_VISION_API_KEY || env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('OCR service not configured');
    }

    // Remove data URI prefix if present
    let cleanBase64 = imageBase64;
    if (imageBase64.includes(',')) {
      cleanBase64 = imageBase64.split(',')[1];
    }

    // Step 1: Extract raw text with Cloud Vision API
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: cleanBase64,
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION',
                maxResults: 1,
              },
            ],
          },
        ],
      }),
    });

    const result = (await response.json()) as any;

    if (!response.ok) {
      const errorMessage = result.error?.message || 'Unknown Cloud Vision error';
      throw new Error(errorMessage);
    }

    let rawText = '';
    if (result.responses && result.responses[0]) {
      const textAnnotations = result.responses[0].textAnnotations;
      if (textAnnotations && textAnnotations.length > 0) {
        rawText = textAnnotations[0].description;
      } else if (result.responses[0].fullTextAnnotation) {
        rawText = result.responses[0].fullTextAnnotation.text;
      } else {
        return ''; // No text found in image
      }
    } else {
      throw new Error('Invalid response from Cloud Vision API');
    }

    // Step 2: Use DeepSeek to clean up and format the text
    try {
      const deepseekApiKey = env.DEEPSEEK_API_KEY;
      if (!deepseekApiKey) {
        return rawText; // No DeepSeek key: return raw Vision text without formatting
      }

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'user',
              content: `Clean up and properly format this OCR-extracted text. Fix any obvious OCR errors, improve formatting, add proper line breaks and structure, but keep all the content intact. Return only the cleaned text without any explanations.

Raw OCR Text:
${rawText}`,
            },
          ],
          max_tokens: 4096,
          temperature: 0.2,
        }),
      });

      const data = (await response.json()) as any;

      if (response.ok && data.choices && data.choices[0]) {
        const formattedText = data.choices[0].message.content.trim();
        return formattedText;
      } else {
        return rawText;
      }
    } catch (deepseekError: any) {
      return rawText;
    }
  } catch (error: any) {
    throw new Error(`OCR failed: ${error.message}`);
  }
}

// Generate note summary - EXACTLY 2 sentences (Uses DeepSeek)
export async function generateNoteSummary(content: string, title: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      throw new Error('AI service not configured');
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: `Summarize this study note in EXACTLY 2 sentences. Focus on the main concepts and key points.

Title: "${title}"

Content:
${content.substring(0, 3000)}

IMPORTANT: Your response must be EXACTLY 2 sentences, no more, no less. Write the summary in Indonesian (Bahasa Indonesia).`,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const summary = data.choices[0].message.content.trim();

    // Ensure it's only 2 sentences by splitting and taking first 2
    const sentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
    const twoSentences = sentences.slice(0, 2).join(' ').trim();

    return twoSentences;
  } catch (error: any) {
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// Generate quiz from note
export async function generateQuiz(content: string, title: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      throw new Error('AI service not configured');
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: `Create a quiz with 5 multiple-choice questions based on the following study note titled "${title}".

Return the response as a JSON object with this structure:
{
  "questions": [
    {
      "id": 1,
      "question": "Question text?",
      "options": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
      "correctAnswer": "A",
      "explanation": "Why this is correct"
    }
  ]
}

IMPORTANT: Write all questions, options, and explanations in Indonesian (Bahasa Indonesia).

Content:
${content}`,
          },
        ],
        max_tokens: 2048,
        temperature: 0.5,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const responseText = data.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid quiz format');
  } catch (error: any) {
    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
}

// Generate study plan
export async function generateStudyPlan(subject: string, topic: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      throw new Error('AI service not configured');
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: `Create a comprehensive 7-day study plan for a student learning about "${topic}" in ${subject}.

The plan should:
- Be realistic and achievable for a high school student
- Include daily goals and activities
- Suggest resources and study techniques
- Include practice problems and self-assessment
- Prepare for exams

Format as a detailed markdown text with clear daily breakdowns. Write the entire plan in Indonesian (Bahasa Indonesia).`,
          },
        ],
        max_tokens: 2048,
        temperature: 0.4,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    return data.choices[0].message.content.trim();
  } catch (error: any) {
    throw new Error(`Failed to generate study plan: ${error.message}`);
  }
}

// Explain concept
export async function explainConcept(concept: string, subject: string, env: Env) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      throw new Error('AI service not configured');
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: `Explain the concept of "${concept}" in the context of ${subject}.

Your explanation should:
- Start with a simple definition
- Use real-world examples
- Break down complex ideas
- Include common misconceptions
- Suggest how to remember it
- Provide practice tips

Make it engaging and suitable for high school students. Write the entire explanation in Indonesian (Bahasa Indonesia).`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.5,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok || !data.choices || data.choices.length === 0) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    return data.choices[0].message.content.trim();
  } catch (error: any) {
    throw new Error(`Failed to explain concept: ${error.message}`);
  }
}

// OCR endpoint
export async function performOCREndpoint(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const body = (await request.json()) as any;
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return jsonResponse({ error: 'Image base64 is required' }, 400);
    }

    const text = await performOCR(imageBase64, mimeType || 'image/jpeg', env);

    return jsonResponse({ text, success: true });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// Generate note summary endpoint
export async function generateNoteSummaryEndpoint(noteId: string, request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const body = (await request.json()) as any;
    const { content, title } = body;

    if (!content) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const summary = await generateNoteSummary(content, title || 'Untitled', env);

    // Update note with summary
    await env.DB.prepare('UPDATE notes SET summary = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(summary, noteId)
      .run();

    return jsonResponse({ summary });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// Generate quiz endpoint
export async function generateQuizEndpoint(noteId: string, request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const body = (await request.json()) as any;
    const { content, title } = body;

    if (!content) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const quiz = await generateQuiz(content, title || 'Untitled', env);

    return jsonResponse({ quiz });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// Generate study plan endpoint
export async function generateStudyPlanEndpoint(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const body = (await request.json()) as any;
    const { subject, topic } = body;

    if (!subject || !topic) {
      return jsonResponse({ error: 'Subject and topic are required' }, 400);
    }

    const plan = await generateStudyPlan(subject, topic, env);

    return jsonResponse({ plan });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// Explain concept endpoint
export async function explainConceptEndpoint(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const body = (await request.json()) as any;
    const { concept, subject } = body;

    if (!concept) {
      return jsonResponse({ error: 'Concept is required' }, 400);
    }

    const explanation = await explainConcept(concept, subject || 'General', env);

    return jsonResponse({ explanation });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}
