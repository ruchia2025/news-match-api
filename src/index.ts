import { parse } from 'papaparse';

export interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') || 'echo.csv';

    console.log(`[INFO] Requested key: ${key}`);

    try {
      const object = await env.BUCKET.get(key);
      if (!object) {
        console.error('[ERROR] CSV file not found in R2');
        return new Response('CSV file not found', { status: 404 });
      }

      const csvText = await object.text();
      console.log(`[INFO] CSV loaded, size: ${csvText.length} chars`);

      const parsed = parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      console.log(`[INFO] Parsed ${parsed.data.length} rows`);
      console.log(`[INFO] Found ${parsed.errors.length} parse errors`);

      parsed.errors.forEach((error, i) => {
        console.warn(`[PARSE ERROR ${i}] Row ${error.row}: ${error.message}`);
      });

      const validRecords = (parsed.data as any[]).filter((row, index) => {
        const title = row.title?.trim?.();
        const body = row.body?.trim?.();

        const isValid = title && body && typeof title === 'string' && typeof body === 'string';

        if (!isValid) {
          console.warn(`[SKIP] Line ${index + 2} skipped due to missing title/body`);
          console.warn(`[SKIP] Raw row: ${JSON.stringify(row)}`);
        }

        return isValid;
      });

      console.log(`[INFO] Valid records: ${validRecords.length}`);

      return new Response(JSON.stringify(validRecords, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('[FATAL ERROR]', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
