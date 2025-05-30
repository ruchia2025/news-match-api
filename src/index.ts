import { Router } from 'itty-router';
import Papa from 'papaparse';

const router = Router();

let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

// CSV 読み込みと整形処理
async function loadCSV(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://your-bucket-url/echo.csv'; // ← 自分のURLに変更してください
  console.log(`[DEBUG] Fetching CSV from ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`[ERROR] Failed to fetch CSV: ${response.status}`);
    throw new Error('CSV fetch failed');
  }

  const text = await response.text();
  console.log(`[DEBUG] Fetched CSV text length: ${text.length}`);

  const { data, errors, meta } = Papa.parse(text, {
    header: true,
    skipEmptyLines: false,
  });

  console.log(`[INFO] Parsed ${data.length} rows`);
  if (errors.length > 0) {
    console.warn(`[WARN] CSV parsing errors (${errors.length}):`);
    errors.slice(0, 5).forEach((e, i) => console.warn(`[WARN] ${i + 1}: ${JSON.stringify(e)}`));
  }

  // ヘッダー確認
  if (!meta.fields?.includes('タイトル') || !meta.fields?.includes('本文')) {
    console.error(`[ERROR] CSV header is missing expected fields`);
    console.error(`[ERROR] Found headers: ${JSON.stringify(meta.fields)}`);
    throw new Error('CSV does not contain required columns: タイトル, 本文');
  }

  validRecords = [];
  let skipped = 0;

  data.forEach((row: any, idx: number) => {
    const lineNumber = idx + 2; // 1行目はヘッダーなので +2

    if (!row || typeof row !== 'object') {
      console.log(`[SKIP] Line ${lineNumber} is not a valid object`);
      skipped++;
      return;
    }

    const title = row['タイトル'];
    const body = row['本文'];

    const isValid =
      typeof title === 'string' &&
      typeof body === 'string' &&
      title.trim().length > 0 &&
      body.trim().length > 0;

    if (isValid) {
      validRecords.push({ title: title.trim(), body: body.trim() });
    } else {
      console.log(`[SKIP] Line ${lineNumber} skipped due to invalid title/body`);
      console.log(`→ title: ${JSON.stringify(title)}, body: ${JSON.stringify(body)}`);
      skipped++;
    }
  });

  console.log(`[INFO] Loaded ${validRecords.length} valid records`);
  console.log(`[INFO] Skipped ${skipped} invalid rows`);
  dataLoaded = true;
}

// 類似ニュース取得API
router.get('/api/nearest-news', async (request) => {
  const userText = request.query?.text || '';

  await loadCSV();

  if (!userText.trim()) {
    return new Response(JSON.stringify({ error: 'Missing query parameter: text' }), {
      status: 400,
    });
  }

  const lowerText = userText.toLowerCase();
  const matched = validRecords.filter(
    (r) =>
      r.title.toLowerCase().includes(lowerText) ||
      r.body.toLowerCase().includes(lowerText)
  );

  console.log(`[INFO] Search input: "${userText}", matched: ${matched.length} items`);

  return new Response(JSON.stringify({ input: userText, matches: matched.slice(0, 5) }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

router.all('*', () => new Response('Not found', { status: 404 }));

export default {
  fetch: (req: Request) => router.handle(req),
};
