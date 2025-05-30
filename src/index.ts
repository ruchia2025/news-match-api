import { Ai } from '@cloudflare/ai';

type News = { title: string; body: string };
type Vec = number[];

let validRecords: News[] = [];
let vectors: Vec[] = [];
let dataLoaded = false;

async function loadJSONAndEmbed(ai: Ai): Promise<void> {
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
    .filter((r): r is News => r !== null);

  // Embed each record (title + body)
  const texts = validRecords.map((r) => `${r.title}\n${r.body}`);
  const aiRes = await ai.run('@cf/baai-bge-small-en-v1.5', { text: texts });
  vectors = aiRes.data;

  dataLoaded = true;
}

function cosineSim(a: Vec, b: Vec): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const query = url.searchParams.get('text') || '';

    if (url.pathname === '/api/nearest-news' && request.method === 'GET') {
      if (!query.trim()) {
        return new Response(JSON.stringify({ error: 'Missing query parameter: text' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const ai = new Ai(env.AI);
      await loadJSONAndEmbed(ai);

      const inputVec = (await ai.run('@cf/baai-bge-small-en-v1.5', {
        text: [query],
      })).data[0];

      const scored = validRecords.map((r, i) => ({
        ...r,
        score: cosineSim(inputVec, vectors[i]),
      }));

      const sorted = scored.sort((a, b) => b.score - a.score).slice(0, 3);

      return new Response(JSON.stringify({ input: query, matches: sorted }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
