import { Router } from 'itty-router';
import Papa from 'papaparse';

const router = Router();

let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

async function loadCSV(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://script.google.com/macros/s/AKfycbyAnL9GbBH6EZPTEWLqPwCSe1KHXT0RVp7Tl6PYjphEagIdra1UGEXp9UtANbmgMI9x2Q/exec';
  console.log(`[STEP] Fetching CSV from ${url}`);
  
  try {
    const res = await fetch(url);
    console.log(`[DEBUG] Fetch status: ${res.status}`);
    if (!res.ok) {
      console.error(`[ERROR] CSV fetch failed: ${res.statusText}`);
      return;
    }

    const csvText = await res.text();
    console.log(`[STEP] CSV text received (${csvText.length} chars)`);

    const { data, errors, meta } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    console.log(`[STEP] Headers parsed: ${meta.fields?.join(', ')}`);
    if (!meta.fields?.includes('タイトル') || !meta.fields.includes('本文')) {
      console.error(`[ERROR] 必要なカラム「タイトル」「本文」が見つかりません`);
      return;
    }

    if (errors.length > 0) console.warn(`[WARN] Parsing errors:`, errors);

    validRecords = [];
    let skipped = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      const title = typeof row['タイトル'] === 'string' ? row['タイトル'].trim() : '';
      const body = typeof row['本文'] === 'string' ? row['本文'].trim() : '';

      if (title && body) {
        validRecords.push({ title, body });
      } else {
        console.log(`[SKIP] row ${i + 2}: title=[${title}], body=[${body}]`);
        skipped++;
      }
    }

    console.log(`[RESULT] validRecords=${validRecords.length}, skipped=${skipped}`);
    dataLoaded = true;
  } catch (e) {
    console.error(`[ERROR] Exception during loadCSV:`, e);
  }
}

router.get('/api/nearest-news', async (request) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('text') || '';

  console.log(`\n===== New Request =====`);
  console.log(`[STEP] URL: ${request.url}`);
  console.log(`[STEP] Query parameter: text = "${query}"`);

  await loadCSV();

  if (validRecords.length === 0) {
    console.error(`[ERROR] No valid news data available`);
    return new Response(JSON.stringify({ error: 'No news data available (CSV empty or malformed)' }), {
      status: 500,
    });
  }

  if (!query.trim()) {
    console.error(`[ERROR] クエリ text が空`);
    return new Response(JSON.stringify({ error: 'Missing query parameter: text' }), {
      status: 400,
    });
  }

  const keyword = query.toLowerCase();
  const matched = validRecords.filter(
    (r) =>
      r.title.toLowerCase().includes(keyword) || r.body.toLowerCase().includes(keyword)
  );

  console.log(`[STEP] ${matched.length} 件マッチ`);
  matched.forEach((m, i) => console.log(`→ ${i + 1}: ${m.title.slice(0, 30)}...`));

  return new Response(JSON.stringify({ input: query, matches: matched }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

router.all('*', () => new Response('Not found', { status: 404 }));

export default {
  fetch: (req: Request) => router.handle(req),
};
