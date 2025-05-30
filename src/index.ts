import { parse } from 'papaparse';

export interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const key = url.searchParams.get('key') || 'echo.csv';

      console.log(`[DEBUG] Fetching CSV from key: ${key}`);
      const object = await env.BUCKET.get(key);

      if (!object) {
        console.warn("[ERROR] CSV file not found in R2 bucket.");
        return new Response('CSV file not found', { status: 404 });
      }

      const csvText = await object.text();
      console.log("[DEBUG] CSV text successfully read");

      const expectedHeaders = ['title', 'body'];

      const parsed = parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      console.log(`[DEBUG] Parsed ${parsed.data.length} rows`);
      console.log(`[DEBUG] Found ${parsed.errors.length} parse errors`);
      parsed.errors.slice(0, 5).forEach((e, i) => {
        console.warn(`[PARSE ERROR ${i}]`, JSON.stringify(e));
      });

      const data = parsed.data as any[];
      let skipped = 0;

      const validRecords = data.filter((row, i) => {
        const keys = Object.keys(row);
        const isHeaderMismatch = !expectedHeaders.every((h) => keys.includes(h));
        const title = row.title?.trim?.();
        const body = row.body?.trim?.();
        const isValid = !isHeaderMismatch && title && body;

        if (!isValid) {
          if (skipped < 10) {
            console.warn(`[SKIP] Line ${i + 2} skipped. Keys=[${keys.join(', ')}], title="${title}", body="${body}"`);
          }
          skipped++;
          return false;
        }
        return true;
      });

      console.log(`[SUMMARY] Total=${data.length}, Valid=${validRecords.length}, Skipped=${skipped}`);

      return new Response(JSON.stringify(validRecords, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (err) {
      console.error("[ERROR] Unexpected failure", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
