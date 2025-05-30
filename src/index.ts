import { Router } from 'itty-router';
import Papa from 'papaparse';

const router = Router();

let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

// CSVロード関数
async function loadCSV(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://script.google.com/macros/s/AKfycbyAnL9GbBH6EZPTEWLqPwCSe1KHXT0RVp7Tl6PYjphEagIdra1UGEXp9UtANbmgMI9x2Q/exec'; // ✅ 正しいURLに置き換え済み

  let text = '';
  try {
    const response = await fetch(url);
    console.log(`[DEBUG] fetch status: ${response.status}`);
    if (!response.ok) {
      console.error(`[ERROR] Fetch failed: ${response.statusText}`);
      return;
    }
    text = await response.text();
    console.log(`[DEBUG] Fetched CSV content (first 300 chars):\n${text.slice(0, 300)}`);
  } catch (err) {
    console.error(`[ERROR] Fetch exception:`, err);
    return;
  }

  const { data, errors, meta } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(), // ✅ ヘッダーのズレ防止
  });

  console.log(`[DEBUG] Headers: ${meta.fields?.join(', ')}`);
  if (errors.length > 0) {
    console.warn(`[WARN] Parse errors:`, errors);
  }

  if (!meta.fields?.includes('タイトル') || !meta.fields.includes('本文')) {
    console.error(`[ERROR] CSV is missing required headers: タイトル or 本文`);
    return;
  }

  validRecords = [];
  let skipped = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as any;
    const rawTitle = row['タイトル'];
    const rawBody = row['本文'];

    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const body = typeof rawBody === 'string' ? rawBody.trim() : '';

    if (title && body) {
      validRecords.push({ title, body });
    } else {
      console.warn(`[SKIP] Line ${i + 2} skipped - title: ${JSON.stringify(title)}, body: ${JSON.stringify(body)}`);
      skipped++;
    }
  }

  console.log(`[INFO] Valid records: ${validRecords.length}`);
  console.log(`[INFO] Skipped rows: ${skipped}`);

  dataLoaded = true;
}

// 類似ニュースAPI
router.get('/api/nearest-news', async (request) => {
  const userText = request.query?.text || '';
  await loadCSV();

  if (!userText.trim()) {
    return new Response(JSON.stringify({ error: 'Missing query parameter: text' }), { status: 400 });
  }

  if (validRecords.length === 0) {
    return new Response(JSON.stringify({ error: 'No news data available (CSV empty or malformed)' }), {
      status: 500,
    });
  }

  const keyword = userText.toLowerCase();
  const matches = validRecords.filter(
    (r) => r.title.toLowerCase().includes(keyword) || r.body.toLowerCase().includes(keyword)
  );

  return new Response(JSON.stringify({ input: userText, matches }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// fallback
router.all('*', () => new Response('Not found', { status: 404 }));

// entry point
export default {
  fetch: (req: Request) => router.handle(req),
};
