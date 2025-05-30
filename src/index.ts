let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

async function loadJSON(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://script.google.com/macros/s/AKfycbzcXzxKaRJT29sMOWS6l6EGd1aMQF2iCfhNmGMdJuldzXTtEPILSLzpY8QQ1CtD__s-Bg/exec';
  const response = await fetch(url);
  const json = await response.json();

  console.log("✅ JSON data loaded. Length:", json.length);

  validRecords = json
    .map((row: any, i: number) => {
      const title = typeof row['タイトル'] === 'string' ? row['タイトル'].trim() : '';
      const body = typeof row['本文'] === 'string' ? row['本文'].trim() : '';

      if (!title || !body) {
        console.log(`⚠️ Skipped record at row ${i + 2}: title or body missing.`);
        return null;
      }

      return { title, body };
    })
    .filter((r): r is { title: string; body: string } => r !== null);

  console.log("✅ validRecords count:", validRecords.length);

  dataLoaded = true;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/nearest-news' && request.method === 'GET') {
      const query = url.searchParams.get('text') || '';
      await loadJSON();

      console.log("🔍 Query received:", query);

      if (!query.trim()) {
        console.log("❌ No query text provided.");
        return new Response(JSON.stringify({ error: 'Missing query parameter: text' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const keyword = query.toLowerCase();

      const matched = validRecords.filter((r) => {
        const inTitle = r.title.toLowerCase().includes(keyword);
        const inBody = r.body.toLowerCase().includes(keyword);
        if (inTitle || inBody) {
          console.log("✅ Match found:", r.title);
        }
        return inTitle || inBody;
      });

      console.log(`🔎 Total matches found: ${matched.length}`);

      return new Response(JSON.stringify({ input: query, matches: matched.slice(0, 3) }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
