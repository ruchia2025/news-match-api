let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

async function loadJSON(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://script.google.com/macros/s/AKfycbzcXzxKaRJT29sMOWS6l6EGd1aMQF2iCfhNmGMdJuldzXTtEPILSLzpY8QQ1CtD__s-Bg/exec';
  const response = await fetch(url);
  const json = await response.json();

  validRecords = json
    .map((row: any) => {
      const title = typeof row['title'] === 'string' ? row['title'].trim() : '';
      const body = typeof row['body'] === 'string' ? row['body'].trim() : '';
      return title && body ? { title, body } : null;
    })
    .filter((r): r is { title: string; body: string } => r !== null);

  dataLoaded = true;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/nearest-news' && request.method === 'GET') {
      const query = url.searchParams.get('text') || '';

      await loadJSON();

      if (!query.trim()) {
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

      return new Response(JSON.stringify({ input: query, matches: matched.slice(0, 3) }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
