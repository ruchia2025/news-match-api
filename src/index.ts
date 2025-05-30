import { Router } from 'itty-router';

const router = Router();

let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

// JSONを読み込む関数（GAS側の出力形式がJSONのとき）
async function loadJSON(): Promise<void> {
  if (dataLoaded) return;

  try {
    const url =
      'https://script.google.com/macros/s/AKfycbzcXzxKaRJT29sMOWS6l6EGd1aMQF2iCfhNmGMdJuldzXTtEPILSLzpY8QQ1CtD__s-Bg/exec';
    const response = await fetch(url);
    const json = await response.json();

    validRecords = json
      .map((row: any) => {
        const title = typeof row['タイトル'] === 'string' ? row['タイトル'].trim() : '';
        const body = typeof row['本文'] === 'string' ? row['本文'].trim() : '';
        return title && body ? { title, body } : null;
      })
      .filter((r): r is { title: string; body: string } => r !== null);

    console.log(`[LOAD] validRecords = ${validRecords.length}`);
    dataLoaded = true;
  } catch (e) {
    console.error(`[ERROR] Failed to load JSON:`, e);
  }
}

// 類似ニュースを検索するエンドポイント
router.get('/api/nearest-news', async (request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('text') || '';

  console.log(`\n===== New Request =====`);
  console.log(`[STEP] URL: ${request.url}`);
  console.log(`[STEP] Query parameter: text = "${query}"`);

  await loadJSON();

  if (validRecords.length === 0) {
    console.error(`[ERROR] No valid news data available`);
    return new Response(
      JSON.stringify({ error: 'No news data available (JSON empty or malformed)' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (!query.trim()) {
    console.error(`[ERROR] クエリ text が空`);
    return new Response(JSON.stringify({ error: 'Missing query parameter: text' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const keyword = query.toLowerCase();

  const matched = validRecords.filter(
    (r) =>
      r.title.toLowerCase().includes(keyword) ||
      r.body.toLowerCase().includes(keyword)
  );

  console.log(`[STEP] ${matched.length} 件マッチ`);
  matched.slice(0, 3).forEach((m, i) =>
    console.log(`→ ${i + 1}: ${m.title.slice(0, 30)}...`)
  );

  return new Response(JSON.stringify({ input: query, matches: matched }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// その他のパス
router.all('*', () => new Response('Not found', { status: 404 }));

// Cloudflare Worker の fetch 関数として router を使う
export default {
  fetch: (req: Request) => router.handle(req),
};
