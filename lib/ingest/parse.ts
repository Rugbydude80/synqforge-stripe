/**
 * Best-effort text extraction for uploads. Never throws; returns '' on failure.
 */
export async function parseToText(file: File | Blob, mimeType?: string): Promise<string> {
  try {
    const type = mimeType || (file as any).type || '';
    const arrayBuffer = await file.arrayBuffer();
    // In this lightweight build we only parse obvious text formats to avoid heavy deps.
    if (type.includes('text') || type.includes('markdown') || type.includes('csv') || type.includes('json')) {
      return new TextDecoder().decode(arrayBuffer);
    }
    // Unsupported office/audio in this minimal implementation
    return '';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ingest.parse] Failed to parse file:', err);
    return '';
  }
}


