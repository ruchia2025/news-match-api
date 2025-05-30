import { Router } from 'itty-router';
import Papa from 'papaparse';

const router = Router();

let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

// CSV 読み込みと整形
async function loadCSV(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://your-bucket-url/echo.csv'; // ← 適宜置き換え
  const response = await fetch(url);
  const text = await response.text();

  const { data, errors } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  console.log(`[INFO] Parsed ${data.length} rows from CSV`);
  console.log(`[INFO] Parsing errors:`, errors);

  let skipped = 0;
  validRecords = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as any;
    const title = row['タイトル'];
    const body = row['本文'];

    const isValid =
      typeof title === 'string' &&
      typeof body === 'string' &&
      title.trim() !== '' &&
      body.trim() !== '';

    if (isValid) {
      validRecords.push({
        title: title.trim(),
        body: body.trim(),
      });
    } else {
      console.log(`[SKIP] Line ${i + 2} skipped due to insufficient columns`);
      console.log(`→ title: ${JSON.stringify(title)}, body: ${JSON.stringify(body)}`);
      skipped++;
    }
  }

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
  const matched = validRecords.filter((r) =>
    r.title.toLowerCase().includes(lowerText) || r.body.toLowerCase().includes(lowerText)
  );

  return new Response(JSON.stringify({ input: userText, matches: matched.slice(0, 5) }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

router.all('*', () => new Response('Not found', { status: 404 }));

export default {
  fetch: (req: Request) => router.handle(req),
};
