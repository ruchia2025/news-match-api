import { parse } from 'papaparse';

export interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const key = url.searchParams.get('key') || 'echo.csv';

      const object = await env.BUCKET.get(key);
      if (!object) return new Response('CSV not found', { status: 404 });

      const csvText = await object.text();

      const parsed = parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      const data = parsed.data as any[];
      const validRecords = [];
      let skipped = 0;

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const title = row?.title?.trim?.();
        const body = row?.body?.trim?.();

        // Papaparse sometimes includes rows as {} if they’re malformed
        const keys = Object.keys(row ?? {});
        if (!title || !body || keys.length < 2) {
          if (skipped < 10) {
            console.warn(`[SKIP] Line ${i + 2} skipped: keys=[${keys.join(', ')}]`);
          }
          skipped++;
          continue;
        }

        validRecords.push({ title, body });
      }

      console.log(`[SUMMARY] total=${data.length}, valid=${validRecords.length}, skipped=${skipped}`);

      return new Response(JSON.stringify(validRecords, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('[ERROR]', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
