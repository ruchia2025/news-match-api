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
        transformHeader: h => h.trim(),
      });

      const data = parsed.data as any[];

      const logs: string[] = [];

      let validCount = 0;
      let skippedCount = 0;

      const results = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        const title = row.title?.trim?.();
        const body = row.body?.trim?.();

        if (typeof title === 'string' && title.length > 0 &&
            typeof body === 'string' && body.length > 0) {
          validCount++;
          results.push({ title, body });
        } else {
          skippedCount++;
          if (i >= data.length - 20) {
            logs.push(`[DEBUG] Skipped Line ${i + 2} | title: "${title}" | body: "${body}"`);
          }
        }
      }

      logs.push(`[SUMMARY] total=${data.length}, valid=${validCount}, skipped=${skippedCount}`);

      return new Response(JSON.stringify({
        logs,
        sample: results.slice(0, 5) // 最初の5件だけ表示
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('[ERROR]', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};
