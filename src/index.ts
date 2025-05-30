import { Ai } from '@cloudflare/ai';
import { parse } from 'papaparse';

export interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = 'https://script.google.com/macros/s/AKfycbyAnL9GbBH6EZPTEWLqPwCSe1KHXT0RVp7Tl6PYjphEagIdra1UGEXp9UtANbmgMI9x2Q/exec';
      const response = await fetch(url);
      const csvText = await response.text();

      // ヘッダー確認ログ
      const headerLine = csvText.split('\n')[0];
      console.log(`[DEBUG] CSV header: ${headerLine}`);

      const parsed = parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      const records = parsed.data as any[];

      let skippedInvalidRows = 0;
      const validRecords = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const title = row['タイトル']?.trim();
        const body = row['本文']?.trim();

        if (title && body && typeof title === 'string' && typeof body === 'string') {
          validRecords.push({ title, body });
        } else {
          skippedInvalidRows++;
          console.log(`[SKIP] Line ${i + 2} skipped: title or body is missing or invalid`);
        }
      }

      console.log(`[DEBUG] Parsed ${records.length} records, kept ${validRecords.length}, skipped ${skippedInvalidRows}`);

      if (validRecords.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid news data available after processing CSV.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ユーザーのクエリ取得
      const { searchParams } = new URL(request.url);
      const query = searchParams.get('q') || (await request.json().catch(() => null))?.q;

      if (!query) {
        return new Response(JSON.stringify({ error: 'No query (q) provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 検索対象テキスト配列（タイトル + 本文）
      const texts = validRecords.map(row => `${row.title}。${row.body}`);
      const ai = new Ai(env.AI);
      const embeddings = await ai.run('@cf/baai/bge-base-ja', {
        texts: [query, ...texts]
      });

      const [userVector, ...articleVectors] = embeddings.data;

      function cosineSimilarity(a: number[], b: number[]): number {
        const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
        const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
        const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
        return dot / (magA * magB);
      }

      const scored = validRecords.map((record, i) => ({
        title: record.title,
        body: record.body,
        score: cosineSimilarity(userVector, articleVectors[i])
      }));

      scored.sort((a, b) => b.score - a.score);

      return new Response(JSON.stringify(scored.slice(0, 10), null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error: any) {
      console.error(`[ERROR] ${error.message || error}`);
      return new Response(JSON.stringify({ error: 'Internal error occurred.', detail: error.message || String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
