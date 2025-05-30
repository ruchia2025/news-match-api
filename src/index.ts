let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

async function loadJSON(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://script.google.com/macros/s/AKfycbzcXzxKaRJT29sMOWS6l6EGd1aMQF2iCfhNmGMdJuldzXTtEPILSLzpY8QQ1CtD__s-Bg/exec';
  console.log(`[loadJSON] Fetching: ${url}`);
  const response = await fetch(url);
  const json = await response.json();

  validRecords = json
    .map((row: any, idx: number) => {
      const title = typeof row['title'] === 'string' ? row['title'].trim() : '';
      const body = typeof row['body'] === 'string' ? row['body'].trim() : '';
      if (!title || !body) console.warn(`[SKIP ${idx}] title or body empty`);
      return title && body ? { title, body } : null;
    })
    .filter((r): r is { title: string; body: string } => r !== null);

  console.log(`[loadJSON] Loaded ${validRecords.length} valid records`);
  dataLoaded = true;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const query = url.searchParams.get('text') || '';

    console.log(`[fetch] Received query: "${query}"`);

    await loadJSON();

    if (!query.trim()) {
      console.warn(`[fetch] Empty query`);
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

    console.log(`[fetch] Found ${matched.length} matches for: "${query}"`);

    matched.slice(0, 3).forEach((m, i) =>
      console.log(`[match ${i + 1}] ${m.title.slice(0, 30)}...`)
    );

    return new Response(JSON.stringify({ input: query, matches: matched.slice(0, 3) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
