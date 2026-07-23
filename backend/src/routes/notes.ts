/**
 * Student-facing note endpoints: browse by subject, search, create (multi-photo),
 * like, update/publish/delete own notes.
 */
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/response';
import { getOrCreateUser } from '../lib/auth';

// Get notes by subject
export async function getNotesBySubject(subjectId: string, request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);
  const url = new URL(request.url);
  const filter = url.searchParams.get('filter'); // 'my_class' | 'my_grade' | null

  let gradeCondition = '';
  let gradeParams: (string | number)[] = [];

  if (filter === 'my_class' && user.class) {
    gradeCondition = "AND (u.class = ? OR u.class IS NULL OR u.class = '')";
    gradeParams = [user.class];
  } else if (filter === 'my_grade' && user.grade) {
    gradeCondition = 'AND (n.author_grade = ? OR n.author_grade IS NULL)';
    gradeParams = [user.grade];
  }

  const { results } = await env.DB.prepare(
    `
    SELECT
      n.id,
      n.title,
      n.description,
      n.subject_id,
      n.author_id,
      n.extracted_text,
      n.summary,
      n.content,
      n.tags,
      n.author_class,
      n.parent_note_id,
      n.part_number,
      n.status,
      n.visibility,
      n.scheduled_publish_at,
      n.likes,
      n.admin_upvotes,
      n.created_at,
      n.updated_at,
      u.display_name as author_name,
      u.photo_url as author_photo,
      u.class as author_class,
      (SELECT COUNT(*) FROM note_likes WHERE note_id = n.id AND user_id = ?) as liked_by_me,
      (SELECT COUNT(*) FROM admin_note_likes WHERE note_id = n.id AND admin_id = ?) as upvoted_by_me
    FROM notes n
    LEFT JOIN users u ON n.author_id = u.id
    WHERE n.subject_id = ?
      AND (n.status = 'published' OR n.status IS NULL OR n.status = '')
      AND (
        n.visibility = 'everyone'
        OR n.visibility IS NULL
        OR n.visibility = ''
        OR (n.visibility = 'class' AND (u.class = ? OR u.class IS NULL OR u.class = ''))
      )
      ${gradeCondition}
    ORDER BY n.created_at DESC
  `,
  )
    .bind(user.id, user.id, subjectId, user.class || '', ...gradeParams)
    .all();

  return jsonResponse({ notes: results });
}

// Search notes
export async function searchNotes(query: string, request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  if (!query || query.trim().length === 0) {
    return jsonResponse({ notes: [] });
  }

  // Smart search: Split query into words for better matching
  const searchWords = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w: string) => w.length > 0);

  // Build LIKE conditions for each word
  const buildLikeConditions = (field: string) => {
    return searchWords.map(() => `LOWER(${field}) LIKE ?`).join(' OR ');
  };

  // Create parameters for binding (each word with wildcards)
  const wordParams = searchWords.map((word: string) => `%${word}%`);

  // Smart search with relevance scoring
  const { results } = await env.DB.prepare(
    `
    SELECT
      n.id,
      n.title,
      n.description,
      n.subject_id,
      n.author_id,
      n.extracted_text,
      n.summary,
      n.content,
      n.tags,
      n.author_class,
      n.parent_note_id,
      n.part_number,
      n.status,
      n.visibility,
      n.scheduled_publish_at,
      n.likes,
      n.admin_upvotes,
      n.created_at,
      n.updated_at,
      u.display_name as author_name,
      u.photo_url as author_photo,
      u.class as author_class,
      s.name as subject_name,
      u.email as author_email,
      (
        /* Title match - highest priority (10 points per word) */
        CASE WHEN ${buildLikeConditions('n.title')} THEN ${searchWords.length * 10} ELSE 0 END +
        /* Author name match - high priority (8 points per word) */
        CASE WHEN ${buildLikeConditions('u.display_name')} THEN ${searchWords.length * 8} ELSE 0 END +
        /* Tags match - medium-high priority (6 points per word) */
        CASE WHEN ${buildLikeConditions('n.tags')} THEN ${searchWords.length * 6} ELSE 0 END +
        /* Subject match - medium priority (5 points per word) */
        CASE WHEN ${buildLikeConditions('s.name')} THEN ${searchWords.length * 5} ELSE 0 END +
        /* Description match - medium priority (4 points per word) */
        CASE WHEN ${buildLikeConditions('n.description')} THEN ${searchWords.length * 4} ELSE 0 END +
        /* Content match - lower priority (2 points per word) */
        CASE WHEN ${buildLikeConditions('n.extracted_text')} THEN ${searchWords.length * 2} ELSE 0 END
      ) as relevance_score
    FROM notes n
    JOIN users u ON n.author_id = u.id
    JOIN subjects s ON n.subject_id = s.id
    WHERE (
        ${buildLikeConditions('n.title')}
        OR ${buildLikeConditions('n.description')}
        OR ${buildLikeConditions('n.extracted_text')}
        OR ${buildLikeConditions('u.display_name')}
        OR ${buildLikeConditions('n.tags')}
        OR ${buildLikeConditions('s.name')}
      )
      AND (n.status = 'published' OR n.status IS NULL)
      AND (
        n.visibility = 'everyone'
        OR n.visibility IS NULL
        OR (n.visibility = 'class' AND u.class = ?)
      )
    ORDER BY relevance_score DESC, n.created_at DESC
    LIMIT 50
  `,
  )
    .bind(
      ...wordParams, // title params (score)
      ...wordParams, // author_name params (score)
      ...wordParams, // tags params (score)
      ...wordParams, // subject params (score)
      ...wordParams, // description params (score)
      ...wordParams, // extracted_text params (score)
      ...wordParams, // WHERE title params
      ...wordParams, // WHERE description params
      ...wordParams, // WHERE extracted_text params
      ...wordParams, // WHERE author_name params
      ...wordParams, // WHERE tags params
      ...wordParams, // WHERE subject params
      user.class, // visibility check
    )
    .all();

  return jsonResponse({ notes: results });
}

// Create new note (with multi-photo support and auto-continuation)
export async function createNote(request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);
    const body = (await request.json()) as any;

    // Validate required fields
    if (!body.subject_id) {
      return jsonResponse({ error: 'Subject ID is required' }, 400);
    }

    if (!body.title) {
      return jsonResponse({ error: 'Title is required' }, 400);
    }

    // Verify subject exists
    const subject = await env.DB.prepare('SELECT id FROM subjects WHERE id = ?')
      .bind(body.subject_id)
      .first();
    if (!subject) {
      return jsonResponse({ error: 'Invalid subject ID' }, 400);
    }

    // Handle images - convert to array format
    let images: string[] = [];
    if (body.images && Array.isArray(body.images)) {
      images = body.images;
    } else if (body.image_path) {
      // For backward compatibility, check if image_path is already a JSON array
      try {
        const parsed = JSON.parse(body.image_path);
        images = Array.isArray(parsed) ? parsed : [body.image_path];
      } catch {
        images = [body.image_path];
      }
    }

    // Convert tags array to JSON string for storage
    const tagsJson = body.tags && Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';

    // Get user's class for the note
    const userData = (await env.DB.prepare('SELECT class FROM users WHERE id = ?')
      .bind(user.id)
      .first()) as any;
    const userClass = userData?.class || null;

    // Determine note status (draft or published)
    const noteStatus = body.status === 'draft' ? 'draft' : 'published';
    const scheduledPublishAt = body.scheduled_publish_at || null;
    const visibility = body.visibility && body.visibility !== '' ? body.visibility : 'everyone';

    // Split images into chunks of max 3 per note
    const MAX_IMAGES_PER_NOTE = 3;
    const imageChunks: string[][] = [];
    for (let i = 0; i < images.length; i += MAX_IMAGES_PER_NOTE) {
      imageChunks.push(images.slice(i, i + MAX_IMAGES_PER_NOTE));
    }

    const createdNotes: any[] = [];
    let parentNoteId: number | null = null;

    // Create notes for each chunk
    for (let chunkIndex = 0; chunkIndex < imageChunks.length; chunkIndex++) {
      const chunk = imageChunks[chunkIndex];
      const partNumber = chunkIndex + 1;
      const isFirstPart = chunkIndex === 0;

      // Determine title for this part
      const noteTitle = isFirstPart ? body.title : `${body.title} (${partNumber})`;

      // Determine extracted text for this part
      let extractedText = '';
      if (isFirstPart) {
        extractedText = body.extracted_text || '';
      } else {
        extractedText = `Continued from previous note...\n\n${body.extracted_text || ''}`;
      }

      // Store images as JSON array
      const imagePathJson = JSON.stringify(chunk);

      // Check size for this chunk
      const chunkData = {
        title: noteTitle,
        description: body.description,
        extracted_text: extractedText,
        image_path: imagePathJson,
        tags: tagsJson,
      };
      const chunkSize = JSON.stringify(chunkData).length;
      const MAX_SIZE = 900000; // 900KB to leave buffer

      if (chunkSize > MAX_SIZE) {
        return jsonResponse(
          {
            error: 'Note data is too large. Please use smaller images.',
            size: chunkSize,
            maxSize: MAX_SIZE,
          },
          413,
        );
      }

      // Create note with continuation fields
      const note: any = await env.DB.prepare(
        `
        INSERT INTO notes (
          title, description, subject_id, author_id, author_class,
          extracted_text, image_path, content, tags, summary,
          status, scheduled_publish_at, visibility,
          parent_note_id, part_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `,
      )
        .bind(
          noteTitle,
          body.description || 'No description',
          body.subject_id,
          user.id,
          userClass,
          extractedText,
          imagePathJson,
          body.content || body.description || '',
          tagsJson,
          body.quick_summary || body.description || '',
          noteStatus,
          scheduledPublishAt,
          visibility,
          parentNoteId, // null for first note, previous note ID for continuations
          partNumber,
        )
        .first();

      if (!note) {
        return jsonResponse({ error: 'Failed to create note' }, 500);
      }

      // Set parent ID for next iteration
      if (isFirstPart) {
        parentNoteId = (note as any).id;
      }

      createdNotes.push(note);

      // Update user stats and subject count (only for published notes)
      if (noteStatus === 'published') {
        try {
          await env.DB.batch([
            env.DB.prepare(
              'UPDATE users SET notes_uploaded = notes_uploaded + 1 WHERE id = ?',
            ).bind(user.id),
            env.DB.prepare('UPDATE subjects SET note_count = note_count + 1 WHERE id = ?').bind(
              body.subject_id,
            ),
          ]);
        } catch (updateError) {}
      }
    }

    return jsonResponse({
      note: createdNotes[0], // Return first note as primary
      notes: createdNotes, // Return all created notes
      success: true,
      totalParts: createdNotes.length,
    });
  } catch (error: any) {
    return jsonResponse({ error: error.message || 'Failed to create note' }, 500);
  }
}

// Update note summary
export async function updateNoteSummary(noteId: string, request: Request, env: Env) {
  const body = (await request.json()) as any;

  await env.DB.prepare('UPDATE notes SET summary = ?, updated_at = datetime("now") WHERE id = ?')
    .bind(body.summary, noteId)
    .run();

  return jsonResponse({ success: true });
}

// Toggle note like
export async function toggleNoteLike(noteId: string, request: Request, env: Env) {
  const user = await getOrCreateUser(request, env);

  // Check if already liked
  const { results } = await env.DB.prepare(
    'SELECT * FROM note_likes WHERE note_id = ? AND user_id = ?',
  )
    .bind(noteId, user.id)
    .all();

  if (results.length > 0) {
    // Unlike
    const note = (await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;

    await env.DB.batch([
      env.DB.prepare('DELETE FROM note_likes WHERE note_id = ? AND user_id = ?').bind(
        noteId,
        user.id,
      ),
      env.DB.prepare('UPDATE notes SET likes = likes - 1 WHERE id = ?').bind(noteId),
      // Decrement author's total_likes (diamonds only from notes now)
      ...(note && note.author_id
        ? [
            env.DB.prepare('UPDATE users SET total_likes = total_likes - 1 WHERE id = ?').bind(
              note.author_id,
            ),
          ]
        : []),
    ]);
    return jsonResponse({ liked: false });
  } else {
    // Like
    const note = (await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;

    await env.DB.batch([
      env.DB.prepare('INSERT INTO note_likes (note_id, user_id) VALUES (?, ?)').bind(
        noteId,
        user.id,
      ),
      env.DB.prepare('UPDATE notes SET likes = likes + 1 WHERE id = ?').bind(noteId),
      // Increment author's total_likes (diamonds only from notes now)
      ...(note && note.author_id
        ? [
            env.DB.prepare('UPDATE users SET total_likes = total_likes + 1 WHERE id = ?').bind(
              note.author_id,
            ),
          ]
        : []),
    ]);
    return jsonResponse({ liked: true });
  }
}

// User update own note
export async function userUpdateNote(noteId: string, request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);
    const body = (await request.json()) as any;

    // Verify ownership
    const note = (await env.DB.prepare('SELECT author_id FROM notes WHERE id = ?')
      .bind(noteId)
      .first()) as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    if (note.author_id !== user.id) {
      return jsonResponse({ error: 'Unauthorized - You can only edit your own notes' }, 403);
    }

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: any[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.content !== undefined) {
      updates.push('content = ?');
      values.push(body.content);
    }
    if (body.extracted_text !== undefined) {
      updates.push('extracted_text = ?');
      values.push(body.extracted_text);
    }
    if (body.image_path !== undefined) {
      updates.push('image_path = ?');
      values.push(body.image_path);
    }
    if (body.summary !== undefined) {
      updates.push('summary = ?');
      values.push(body.summary);
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }

    if (updates.length === 0) {
      return jsonResponse({ error: 'No fields to update' }, 400);
    }

    // Always update updated_at
    updates.push('updated_at = datetime("now")');
    values.push(noteId);

    const query = `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query)
      .bind(...values)
      .run();

    // Get updated note
    const updatedNote = await env.DB.prepare('SELECT * FROM notes WHERE id = ?')
      .bind(noteId)
      .first();

    return jsonResponse({ success: true, note: updatedNote });
  } catch (error: any) {
    return jsonResponse({ error: 'Failed to update note' }, 500);
  }
}

// Get user's own notes
export async function getMyNotes(request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);

    // Check if filtering by status
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status'); // 'draft', 'published', or null for all

    let query = `
      SELECT
        n.id,
        n.title,
        n.subject_id as subject,
        s.name as subject_name,
        n.extracted_text,
        n.summary,
        n.tags,
        n.likes,
        n.admin_upvotes,
        n.created_at,
        n.image_path,
        n.status,
        n.scheduled_publish_at,
        n.subject_id,
        n.visibility
      FROM notes n
      LEFT JOIN subjects s ON n.subject_id = s.id
      WHERE n.author_id = ?
    `;

    const bindings = [user.id];

    if (statusFilter === 'draft') {
      query += ` AND n.status = 'draft'`;
    } else if (statusFilter === 'published') {
      query += ` AND (n.status = 'published' OR n.status IS NULL)`;
    }

    query += ` ORDER BY s.name, n.created_at DESC`;

    const { results: notes } = await env.DB.prepare(query)
      .bind(...bindings)
      .all();

    return jsonResponse({ notes });
  } catch (error: any) {
    return jsonResponse({ error: 'Failed to get notes' }, 500);
  }
}

// Publish a draft note
export async function publishDraftNote(noteId: string, request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);

    // Get the note and verify ownership
    const note = (await env.DB.prepare(
      'SELECT author_id, subject_id, status FROM notes WHERE id = ?',
    )
      .bind(noteId)
      .first()) as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    if (note.author_id !== user.id) {
      return jsonResponse({ error: 'Unauthorized - You can only publish your own notes' }, 403);
    }

    if (note.status !== 'draft') {
      return jsonResponse({ error: 'Note is already published' }, 400);
    }

    // Update note status to published
    await env.DB.prepare(
      `
      UPDATE notes
      SET status = 'published', scheduled_publish_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `,
    )
      .bind(noteId)
      .run();

    // Update user stats and subject count (since it's being published now)
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET notes_uploaded = notes_uploaded + 1 WHERE id = ?').bind(
        user.id,
      ),
      env.DB.prepare('UPDATE subjects SET note_count = note_count + 1 WHERE id = ?').bind(
        note.subject_id,
      ),
    ]);

    // Get updated note
    const updatedNote = await env.DB.prepare('SELECT * FROM notes WHERE id = ?')
      .bind(noteId)
      .first();

    return jsonResponse({ success: true, note: updatedNote });
  } catch (error: any) {
    return jsonResponse({ error: 'Failed to publish note' }, 500);
  }
}

// User delete own note (with point deduction)
export async function userDeleteNote(noteId: string, request: Request, env: Env) {
  try {
    const user = await getOrCreateUser(request, env);

    // Verify ownership
    const note = (await env.DB.prepare(
      'SELECT author_id, subject_id, likes, admin_upvotes FROM notes WHERE id = ?',
    )
      .bind(noteId)
      .first()) as any;

    if (!note) {
      return jsonResponse({ error: 'Note not found' }, 404);
    }

    if (note.author_id !== user.id) {
      return jsonResponse({ error: 'Unauthorized - You can only delete your own notes' }, 403);
    }

    // Calculate points to deduct: user likes (1 each) + admin upvotes (5 each)
    const pointsToDeduct = (note.likes || 0) + (note.admin_upvotes || 0) * 5;

    // Delete related data and update stats
    await env.DB.batch([
      // Delete note likes
      env.DB.prepare('DELETE FROM note_likes WHERE note_id = ?').bind(noteId),
      // Delete admin note likes
      env.DB.prepare('DELETE FROM admin_note_likes WHERE note_id = ?').bind(noteId),
      // Delete the note itself
      env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(noteId),
      // Update note count in subjects table (ensure it doesn't go below 0)
      env.DB.prepare('UPDATE subjects SET note_count = MAX(0, note_count - 1) WHERE id = ?').bind(
        note.subject_id,
      ),
      // Update user stats: decrease notes_uploaded, total_likes, and total_admin_upvotes (ensure they don't go below 0)
      env.DB.prepare(
        `
        UPDATE users
        SET
          notes_uploaded = MAX(0, notes_uploaded - 1),
          total_likes = MAX(0, total_likes - ?),
          total_admin_upvotes = MAX(0, total_admin_upvotes - ?)
        WHERE id = ?
      `,
      ).bind(note.likes || 0, note.admin_upvotes || 0, user.id),
    ]);

    return jsonResponse({ success: true, points_deducted: pointsToDeduct });
  } catch (error: any) {
    return jsonResponse({ error: 'Failed to delete note' }, 500);
  }
}
