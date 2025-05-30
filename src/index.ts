import { Router } from 'itty-router';
import Papa from 'papaparse';

const router = Router();

let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

async function loadCSV(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://your-bucket-url/echo.csv'; // ← 実際のURLに書き換えてください
  const response = await fetch(url);
  const text = await response.text();

  const { data, errors, meta } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    newline: '', // 改行自動検出
  });

  console.log(`[INFO] CSVヘッダー: ${meta.fields?.join(', ')}`);
  console.log(`[INFO] パース結果 行数: ${data.length}`);
  if (errors.length > 0) console.log(`[WARN] PapaParseエラー:`, errors);

  let skipped = 0;
  validRecords = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as any;
    const lineNo = i + 2; // ヘッダーを除いて+2で人間のCSV行番号

    const rawTitle = row["タイトル"];
    const rawBody = row["本文"];

    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const body = typeof rawBody === 'string' ? rawBody.trim() : '';

    const isValid = title.length > 0 && body.length > 0;

    if (isValid) {
      validRecords.push({ title, body });
    } else {
      console.log(`[SKIP] Line ${lineNo} スキップ:`);
      console.log(`→ title: ${JSON.stringify(rawTitle)}, body: ${JSON.stringify(rawBody)}`);
      skipped++;
    }
  }

  console.log(`[INFO] 有効データ数: ${validRecords.length}`);
  console.log(`[INFO] スキップ行数: ${skipped}`);
  console.log(`[SAMPLE] 最初の5件:`);
  validRecords.slice(0, 5).forEach((r, idx) => {
    console.log(` ${idx + 1}: タイトル="${r.title.slice(0, 30)}", 本文="${r.body.slice(0, 30)}"`);
  });

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
  const matched = validRecords.filter(r =>
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
