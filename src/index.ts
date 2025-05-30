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

      let skipped = 0;
      const validRecords = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        // 欠損行・空セル行を除外
        if (!row || typeof row !== 'object') {
          skipped++;
          continue;
        }

        const title = row.title?.trim?.();
        const body = row.body?.trim?.();

        // title・body が両方存在し、文字列であることを確認
        const isValid =
          typeof title === 'string' &&
          title.length > 0 &&
          typeof body === 'string' &&
          body.length > 0;

        if (isValid) {
          validRecords.push({ title, body });
        } else {
          skipped++;
        }
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
