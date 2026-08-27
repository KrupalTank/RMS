/**
 * Safely parses images whether returned as a JS array,
 * PostgreSQL string array '{"url1","url2"}', or JSON string.
 */
export const parseProductImages = (imagesField) => {
  if (!imagesField) return [];

  if (Array.isArray(imagesField)) {
    // If it's already an array, flatten and trim any surrounding quotes/braces
    return imagesField
      .map((item) => String(item).replace(/^["'{]+|[}"']+$/g, '').trim())
      .filter((url) => url && url.startsWith('http'));
  }

  if (typeof imagesField === 'string') {
    const trimmed = imagesField.trim();

    // Handle JSON array string: '["https://..."]'
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // fallback
      }
    }

    // Handle PostgreSQL native array format: '{"https://...","https://..."}'
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((url) => url.replace(/^["'\s]+|["'\s]+$/g, ''))
        .filter((url) => url && url.startsWith('http'));
    }

    // Fallback: single URL string
    if (trimmed.startsWith('http')) {
      return [trimmed];
    }
  }

  return [];
};