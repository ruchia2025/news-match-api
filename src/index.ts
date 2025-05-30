import { Ai } from '@cloudflare/ai';
import { parse } from 'papaparse';

export interface Env {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = 'https://script.google.com/macros/s/AKfycbyAnL9GbBH6EZPTEWLqPwCSe1KHXT0RVp7Tl6PYjphEagIdra1UGEXp9UtANbmgMI9x2Q/exec';
    const response = await fetch(url);
    const csvText = await response.text();

    // CSV をパース（ヘッダーあり） - 強化された設定を適用
    const parsed = parse(csvText, {
      header: true,
      skipEmptyLines: true, // 空行をスキップ
      transformHeader: (h) => h.trim(), // ヘッダーの前後空白を除去
    });
    const records = parsed.data as any[];

    let skippedInvalidRows = 0; // スキップされた無効な行の数をカウント

    // 有効なレコードだけ抽出 - 強化されたフィルタリングロジックを適用
    const validRecords = records.filter(row => {
      const title = row.title?.trim(); // undefined対策と前後空白除去
      const body = row.body?.trim();   // undefined対策と前後空白除去

      // title と body がどちらも存在し、空文字でなく、かつ文字列型であることを確認
      const isValid = title && body && typeof title === 'string' && typeof body === 'string';

      if (!isValid) {
        skippedInvalidRows++; // 無効な行をカウント
      }
      return isValid;
    });

    // ログにスキップされた行数を出力（Cloudflareのログ上限を考慮し、個別のconsole.logは避ける）
    console.log(`Skipped ${skippedInvalidRows} invalid rows during CSV parsing.`);

    // 有効なニュースデータがない場合にエラーを返す
    if (validRecords.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid news data available after processing CSV.' }), {
        status: 500, // 内部サーバーエラーとして扱う
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ユーザー入力取得（クエリ or JSON）
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || (await request.json().catch(() => null))?.q;

    if (!query) {
      return new Response(JSON.stringify({ error: 'No query (q) provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ★ 日本語処理：文字単位で分かち書き風にする
    function tokenize(text: string): string[] {
      return [...text.replace(/\s/g, '')]; // 空白除去して1文字ずつ
    }

    // ベクトル化用にタイトル＋本文のペアで処理
    const texts = validRecords.map(row => `${row.title}。${row.body}`);
    const userText = query;

    const ai = new Ai(env.AI);

    const embeddings = await ai.run('@cf/baai/bge-base-ja', {
      texts: [userText, ...texts]
    });

    const [userVector, ...articleVectors] = embeddings.data;

    function cosineSimilarity(a: number[], b: number[]): number {
      const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
      const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
      const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
      return dot / (magA * magB);
    }

    // 類似度を計算してスコア付きで返す
    const scored = validRecords.map((record, i) => ({
      title: record.title,
      body: record.body,
      score: cosineSimilarity(userVector, articleVectors[i])
    }));

    scored.sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify(scored.slice(0, 10), null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
