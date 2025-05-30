import { Router } from 'itty-router';
import Papa from 'papaparse';

const router = Router();
let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

async function loadCSV(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://your-bucket-url/echo.csv'; // ← Cloudflare R2等
  const response = await fetch(url);
  let text = await response.text();

  // 途中改行を防ぐ
  text = text
    .split('\n')
    .map(line => line.replace(/\r?\n/g, '').trim()) // 各行の改行除去・トリム
    .filter(line => line.split(',').length >= 2) // 明らかに列数が足りない行は除外
    .join('\n');

  const { data, errors } = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });

  const headerRow = data[0];
  const titleIndex = headerRow.findIndex(h => h?.trim() === 'タイトル');
  const bodyIndex = headerRow.findIndex(h => h?.trim() === '本文');

  if (titleIndex === -1 || bodyIndex === -1) {
    throw new Error('「タイトル」または「本文」列が見つかりません');
  }

  validRecords = [];
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    const title = row[titleIndex];
    const body = row[bodyIndex];

    if (
      typeof title === 'string' &&
      typeof body === 'string' &&
      title.trim() !== '' &&
      body.trim() !== ''
    ) {
      validRecords.push({ title: title.trim(), body: body.trim() });
    } else {
      skipped++;
      if (skipped <= 10) {
        console.log(`[SKIP] Line ${i + 1}: title=${JSON.stringify(title)}, body=${JSON.stringify(body)}`);
      }
    }
  }

  console.log(`[INFO] Total rows parsed: ${data.length}`);
  console.log(`[INFO] Valid rows: ${validRecords.length}`);
  console.log(`[INFO] Skipped rows: ${skipped}`);
  dataLoaded = true;
}

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

  return new Response(JSON.stringify({ input: userText, matches: matched.slice(0, 5) }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

router.all('*', () => new Response('Not found', { status: 404 }));

export default {
  fetch: (req: Request) => router.handle(req),
};
