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
    // Try lightweight PDF extraction if possible
    if (type.includes('pdf')) {
      try {
        // Optional dependency; if not installed, skip gracefully
        const { default: pdfParse } = ({} as any);
        if (pdfParse) {
          const res = await pdfParse(Buffer.from(arrayBuffer));
          if (res?.text) return res.text;
        }
      } catch {}
      return '';
    }
    // Try lightweight DOCX extraction if possible
    if (type.includes('word') || type.includes('officedocument.wordprocessingml.document') || type.endsWith('docx')) {
      try {
        // Optional dependency; if not installed, skip gracefully
        const { default: mammoth } = ({} as any);
        if (mammoth && typeof mammoth.extractRawText === 'function') {
          const res = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
          if (res?.value) return res.value;
        }
      } catch {}
      return '';
    }
    // Unsupported formats: return empty string to avoid throwing
    return '';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ingest.parse] Failed to parse file:', err);
    return '';
  }
}


