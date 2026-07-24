/**
 * Validates a user-supplied photo URL before it is used in a CSS background
 * or img src attribute.
 *
 * Allowed schemes:
 *   - https:  — remote avatar URLs (e.g. Google profile pictures)
 *   - data:image/(png|jpeg|jpg|webp|gif)  — base64 avatars uploaded via
 *     the profile editor (readAsDataURL) and stored / returned by the backend
 *
 * Any other value (javascript:, data:text/html, relative paths, etc.) returns
 * undefined so the caller falls back to the existing gradient placeholder.
 */
export function safePhotoUrl(url?: string): string | undefined {
  if (!url) return undefined;

  // Allow safe data-URI image types produced by FileReader.readAsDataURL
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(url)) {
    return url;
  }

  // Allow https remote URLs
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      return url;
    }
  } catch {
    // not a valid absolute URL
  }

  return undefined;
}
