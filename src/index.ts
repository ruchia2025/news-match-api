import { Ai } from '@cloudflare/ai';
import { parse } from 'papaparse';

export interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    console.log('[DEBUG] fetch() called');

    // CSV 取得
    const url = 'https://script.google.com/macros/s/AKfycbyAnL9GbBH6EZPTEWLqPwCSe1KHXT0RVp7Tl6PYjphEagIdra1UGEXp9UtANbmgMI9x2Q/exec';
    console.log(`[DEBUG] Fetching CSV from: ${url}`);
    const response = await fetch(url);
    const csvText = await response.text();
    console.log('[DEBUG] CSV text fetched, length:', csvText.length);

    // CSV パース
    const parsed = parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
    });
    const records = parsed.data as any[];
    console.log('[DEBUG] CSV parsed. Total records:', records.length);

    // バリデーション＋フィルタ
    let skippedInvalidRows = 0;
    const validRecords = records.filter((row, index) => {
      const title = row.title?.trim();
      const body = row.body?.trim();

      const isValid =
        typeof title === 'string' &&
        typeof body === 'string' &&
        title.length > 0 &&
        body.length > 0;

      if (!isValid) {
        skippedInvalidRows++;
        if (skippedInvalidRows <= 5) {
          console.log(`[SKIP] Line ${index + 2} skipped. Reason: invalid or missing columns`);
          console.log('[SKIP] Row content:', row);
        }
      }
      return isValid;
    });

    console.log(`[DEBUG] Valid records after filtering: ${validRecords.length}`);
    console.log(`[DEBUG] Skipped rows: ${skippedInvalidRows}`);

    if (validRecords.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid news data available after processing CSV.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // クエリ取得
    const { searchParams } = new URL(request.url);
    let query = searchParams.get('q');
    if (!query) {
      try {
        const jsonBody = await request.json();
        query = jsonBody.q;
      } catch (e) {
        console.log('[ERROR] Failed to parse JSON body:', e);
      }
    }

    if (!query) {
      console.log('[ERROR] No query provided');
      return new Response(JSON.stringify({ error: 'No query (q) provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[DEBUG] Query received:', query);

    const texts = validRecords.map(row => `${row.title}。${row.body}`);
    const userText = query;

    // Embedding 実行
    const ai = new Ai(env.AI);
    console.log('[DEBUG] Running embedding with bge-base-ja');
    const embeddings = await ai.run('@cf/baai/bge-base-ja', {
      texts: [userText, ...texts],
    });
    console.log('[DEBUG] Embedding completed. Total vectors:', embeddings.data.length);

    const [userVector, ...articleVectors] = embeddings.data;

    function cosineSimilarity(a: number[], b: number[]): number {
      const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
      const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
      const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
      return dot / (magA * magB);
    }

    // 類似度スコア計算
    console.log('[DEBUG] Calculating cosine similarity for each article...');
    const scored = validRecords.map((record, i) => {
      const score = cosineSimilarity(userVector, articleVectors[i]);
      if (i < 3) {
        console.log(`[DEBUG] Record ${i + 1}: "${record.title}" → score: ${score.toFixed(4)}`);
      }
      return {
        title: record.title,
        body: record.body,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const result = scored.slice(0, 10);
    console.log('[DEBUG] Top 3 results:', result.slice(0, 3));

    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
