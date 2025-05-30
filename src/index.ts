import { Router } from 'itty-router';
import Papa from 'papaparse';

const router = Router();

// CSVデータ格納用
let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

// CSV読み込み＆整形関数
async function loadCSV(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://your-bucket-url/echo.csv'; // ← 本番用に置き換え

  let text = '';
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[ERROR] CSV fetch failed: ${response.status} ${response.statusText}`);
      return;
    }
    text = await response.text();
  } catch (err) {
    console.error(`[ERROR] Failed to fetch CSV:`, err);
    return;
  }

  const { data, errors, meta } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  console.log(`[INFO] Parsed ${data.length} rows`);
  if (errors.length > 0) {
    console.warn(`[WARN] Parse errors:`, errors);
  }

  if (!meta.fields?.includes("タイトル") || !meta.fields.includes("本文")) {
    console.error(`[ERROR] Missing required columns. Found headers: ${meta.fields?.join(', ')}`);
    return;
  }

  if (data.length === 0) {
    console.warn(`[WARN] CSV parsed but no data found`);
    return;
  }

  validRecords = [];
  let skipped = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as any;
    const rawTitle = row["タイトル"];
    const rawBody = row["本文"];

    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const body = typeof rawBody === 'string' ? rawBody.trim() : '';

    if (title && body) {
      validRecords.push({ title, body });
    } else {
      console.warn(`[SKIP] Line ${i + 2} skipped - title: ${JSON.stringify(title)}, body: ${JSON.stringify(body)}`);
      skipped++;
    }
  }

  console.log(`[INFO] Loaded ${validRecords.length} valid records, skipped ${skipped} rows`);
  dataLoaded = true;
}

// 類似ニュースAPI
router.get('/api/nearest-news', async (request) => {
  const userText = request.query?.text || '';
  await loadCSV();

  if (!userText.trim()) {
    return new Response(JSON.stringify({ error: 'Missing query parameter: text' }), {
      status: 400,
    });
  }

  if (validRecords.length === 0) {
    return new Response(JSON.stringify({ error: 'No news data available (CSV missing or empty or malformed)' }), {
      status: 500,
    });
  }

  const lowerText = userText.toLowerCase();
  const matched = validRecords.filter(r =>
    r.title.toLowerCase().includes(lowerText) || r.body.toLowerCase().includes(lowerText)
  );

  return new Response(JSON.stringify({
    input: userText,
    matches: matched.slice(0, 5),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// その他のルーティング
router.all('*', () => new Response('Not found', { status: 404 }));

// Cloudflare Worker エントリーポイント
export default {
  fetch: (req: Request) => router.handle(req),
};
