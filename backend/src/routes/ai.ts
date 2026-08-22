import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getUserFromToken } from '../lib/auth';

// Best-effort AI usage logging. Never throws.
export async function logAiUsage(
  env: Env,
  provider: string,
  endpoint: string,
  ok: boolean,
  durationMs: number,
  tokens: number | null,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO ai_usage (provider, endpoint, ok, duration_ms, tokens) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(provider, endpoint, ok ? 1 : 0, durationMs, tokens)
      .run();
  } catch {
    // non-fatal
  }
}

export async function performOCR(imageBase64: string, mimeType: string, env: Env) {
  try {
    const apiKey = env.GOOGLE_CLOUD_VISION_API_KEY || env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('OCR service not configured');
    }

    let cleanBase64 = imageBase64;
    if (imageBase64.includes(',')) {
      cleanBase64 = imageBase64.split(',')[1];
    }

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
        return '';
      }
    } else {
      throw new Error('Invalid response from Cloud Vision API');
    }

    try {
      const deepseekApiKey = env.DEEPSEEK_API_KEY;
      if (!deepseekApiKey) {
        return rawText;
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

    const summaryStart = Date.now();
    const data = (await response.json()) as any;
    const summaryOk = response.ok && !!data.choices && data.choices.length > 0;
    await logAiUsage(
      env,
      'deepseek',
      'summary',
      summaryOk,
      Date.now() - summaryStart,
      data?.usage?.total_tokens ?? null,
    );

    if (!summaryOk) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    const summary = data.choices[0].message.content.trim();

    const sentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
    const twoSentences = sentences.slice(0, 2).join(' ').trim();

    return twoSentences;
  } catch (error: any) {
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

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

// ---------------------------------------------------------------------------
// Class primer generation (POST /api/ai/primer) — Paperloop Phase 5.
// Stateless: the ONLY input is a free-text topic string. No note is read, no
// DB row is touched, nothing is persisted — a fresh primer is generated on
// every call. Mirrors the DeepSeek fetch/error shape of generateStudyPlan /
// explainConcept, but returns STRUCTURED JSON (like generateQuiz /
// generateStructuredQuiz) so PrimerPage can render it as three sections.
// ---------------------------------------------------------------------------

export async function generatePrimer(
  topic: string,
  env: Env,
): Promise<{ overview: string; key_concepts: string[]; questions: string[] }> {
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
            content: `A student wants to catch up before a class on "${topic}". Create a concise pre-class primer.

Return ONLY a JSON object with this exact structure (no extra text before or after):
{
  "overview": "A short 2-3 sentence overview of the topic.",
  "key_concepts": ["concept 1", "concept 2", "concept 3"],
  "questions": ["priming question 1", "priming question 2", "priming question 3"]
}

Rules:
- "overview": 2-3 sentences introducing the topic at a high-school level.
- "key_concepts": 4-6 short strings, each a key idea to know before class.
- "questions": 3-5 priming questions to think about before class.
- Write everything in Indonesian (Bahasa Indonesia).

Topic: ${topic}`,
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

    const responseText = data.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid primer format');
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      overview?: unknown;
      key_concepts?: unknown;
      questions?: unknown;
    };
    return {
      overview: typeof parsed.overview === 'string' ? parsed.overview : '',
      key_concepts: Array.isArray(parsed.key_concepts)
        ? parsed.key_concepts.filter((c): c is string => typeof c === 'string')
        : [],
      questions: Array.isArray(parsed.questions)
        ? parsed.questions.filter((q): q is string => typeof q === 'string')
        : [],
    };
  } catch (error: any) {
    throw new Error(`Failed to generate primer: ${error.message}`);
  }
}

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

    await env.DB.prepare('UPDATE notes SET summary = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(summary, noteId)
      .run();

    return jsonResponse({ summary });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

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

// ---------------------------------------------------------------------------
// Structured multi-type quiz generation (POST /api/ai/quiz) — Paperloop Phase 4.
// Distinct from the MCQ-only generateQuiz above: supports MCQ / True-False /
// Short-answer, calibrated to a difficulty, sourced from either a single owned
// note or the caller's OWN notes within a subject (author_id-scoped — never
// community-scoped, so no other user's note content can leak into a quiz).
// ---------------------------------------------------------------------------

type QuizSourceType = 'note' | 'subject';
type QuizDifficulty = 'easy' | 'medium' | 'hard';
type QuizQuestionType = 'mcq' | 'true_false' | 'short_answer';

// Aggregate multiple notes' text into one bounded context string. Ported (not
// imported) from the deleted chat formatNotesForContext truncation pattern: a
// per-note cap stops any single note dominating; a total cap bounds the prompt.
function truncateAndJoinNoteContent(
  notes: Array<{ title?: string; extracted_text?: string | null }>,
  perNoteCap = 1200,
  totalCap = 7000,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const note of notes) {
    const raw = (note.extracted_text || '').trim();
    if (!raw) continue;
    const block = `[${note.title || 'Untitled'}]\n${raw.substring(0, perNoteCap)}`;
    if (used + block.length > totalCap) {
      const remaining = totalCap - used;
      if (remaining > 0) parts.push(block.substring(0, remaining));
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n---\n\n');
}

// Resolve the requested source into { title, content }, enforcing ownership.
// 'forbidden' → a note owned by someone else; null → no owned content exists
// (missing note, or a subject with zero notes for this user).
async function resolveQuizSourceContent(
  sourceType: QuizSourceType,
  sourceId: number,
  userId: number,
  env: Env,
): Promise<{ title: string; content: string } | 'forbidden' | null> {
  if (sourceType === 'note') {
    const row = (await env.DB.prepare(
      'SELECT extracted_text, title, author_id FROM notes WHERE id = ?',
    )
      .bind(sourceId)
      .first()) as { extracted_text: string | null; title: string; author_id: number } | null;
    if (!row) return null;
    // Ownership gate runs BEFORE any content is used in the AI prompt.
    if (row.author_id !== userId) return 'forbidden';
    return { title: row.title, content: (row.extracted_text || '').trim() };
  }

  // subject: author_id-scoped — personal-only. Do NOT reuse getNotesBySubject
  // (community-scoped, no author filter — using it here would be an IDOR).
  const { results } = await env.DB.prepare(
    'SELECT extracted_text, title FROM notes WHERE subject_id = ? AND author_id = ?',
  )
    .bind(sourceId, userId)
    .all();
  const notes = (results || []) as Array<{ extracted_text: string | null; title: string }>;
  if (notes.length === 0) return null;
  const content = truncateAndJoinNoteContent(notes);
  const subjectRow = (await env.DB.prepare('SELECT name FROM subjects WHERE id = ?')
    .bind(sourceId)
    .first()) as { name: string } | null;
  const title = subjectRow?.name || notes[0].title || 'Subject';
  return { title, content };
}

export async function generateStructuredQuiz(
  sourceContent: { title: string; content: string },
  count: number,
  difficulty: QuizDifficulty,
  types: QuizQuestionType[],
  env: Env,
) {
  try {
    const deepseekApiKey = env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      throw new Error('AI service not configured');
    }

    const typeList = types.join(', ');
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
            content: `Create a ${difficulty}-difficulty quiz with EXACTLY ${count} questions based on the study material titled "${sourceContent.title}". Distribute the questions across these types: ${typeList}.

Return ONLY a JSON object with this exact structure (no extra text):
{
  "questions": [
    {
      "type": "mcq",
      "question": "Question text?",
      "options": ["option 1", "option 2", "option 3", "option 4"],
      "correct_answer": 0,
      "explanation": "Why this is correct"
    },
    {
      "type": "true_false",
      "question": "Statement to judge.",
      "options": ["True", "False"],
      "correct_answer": 0,
      "explanation": "Why"
    },
    {
      "type": "short_answer",
      "question": "Open question?",
      "model_answer": "The reference answer with the key points a correct response must contain.",
      "explanation": "Grading notes / rubric"
    }
  ]
}

Rules:
- "type" MUST be one of: ${typeList}.
- For "mcq": provide 4 "options" and "correct_answer" as the 0-based index of the correct option.
- For "true_false": "options" is ["True", "False"] and "correct_answer" is 0 (True) or 1 (False).
- For "short_answer": provide a "model_answer" (the reference answer used for grading) and NO options.
- Every question has an "explanation".
- Write all questions, options, answers, and explanations in Indonesian (Bahasa Indonesia).

Study material:
${sourceContent.content}`,
          },
        ],
        max_tokens: 3000,
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

export async function generateStructuredQuizEndpoint(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const body = (await request.json()) as any;
    const sourceType = body.source_type;
    const sourceId = Number(body.source_id);
    const count = Number(body.count);
    const difficulty = body.difficulty;
    const types = body.types;

    if (sourceType !== 'note' && sourceType !== 'subject') {
      return jsonResponse({ error: 'source_type must be "note" or "subject"' }, 400, env);
    }
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return jsonResponse({ error: 'source_id must be a positive integer' }, 400, env);
    }
    if (!Number.isInteger(count) || count <= 0 || count > 20) {
      return jsonResponse({ error: 'count must be an integer between 1 and 20' }, 400, env);
    }
    if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
      return jsonResponse({ error: 'difficulty must be easy, medium, or hard' }, 400, env);
    }
    const allowedTypes = ['mcq', 'true_false', 'short_answer'];
    if (
      !Array.isArray(types) ||
      types.length === 0 ||
      !types.every((t: unknown) => typeof t === 'string' && allowedTypes.includes(t))
    ) {
      return jsonResponse(
        { error: 'types must be a non-empty array of: mcq, true_false, short_answer' },
        400,
        env,
      );
    }

    const source = await resolveQuizSourceContent(sourceType, sourceId, user.id, env);
    if (source === 'forbidden') {
      return jsonResponse(
        { error: 'Unauthorized - You can only generate quizzes from your own notes' },
        403,
        env,
      );
    }
    if (source === null || !source.content) {
      return jsonResponse({ error: 'No content found for this source' }, 404, env);
    }

    const quiz = await generateStructuredQuiz(source, count, difficulty, types, env);
    return jsonResponse(quiz);
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

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

export async function generatePrimerEndpoint(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, env);

    const body = (await request.json()) as any;
    const { topic } = body;

    if (!topic) {
      return jsonResponse({ error: 'Topic is required' }, 400);
    }

    const { overview, key_concepts, questions } = await generatePrimer(topic, env);

    return jsonResponse({ overview, key_concepts, questions });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}
