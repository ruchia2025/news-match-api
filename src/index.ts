let validRecords: { title: string; body: string }[] = [];
let dataLoaded = false;

// ✅ ニュースデータをロード（1度だけ）
async function loadJSON(): Promise<void> {
  if (dataLoaded) return;

  const url = 'https://script.google.com/macros/s/AKfycbzcXzxKaRJT29sMOWS6l6EGd1aMQF2iCfhNmGMdJuldzXTtEPILSLzpY8QQ1CtD__s-Bg/exec';
  const response = await fetch(url);
  const json = await response.json();

  validRecords = json
    .map((row: any, i: number) => {
      const title = typeof row['title'] === 'string' ? row['title'].trim() : '';
      const body = typeof row['body'] === 'string' ? row['body'].trim() : '';
      return title && body ? { title, body } : null;
    })
    .filter((r): r is { title: string; body: string } => r !== null);

  dataLoaded = true;
  console.log(`✅ JSON Loaded: ${validRecords.length} records`);
}

// ✅ 単純な単語オーバーラップでスコア計算
function simpleSimilarityScore(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\W+/);
  const words2 = text2.toLowerCase().split(/\W+/);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = [...set1].filter((w) => set2.has(w));
  return intersection.length / Math.max(set1.size, 1);
}

function createCORSResponse(body: any, status: number = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // ⭐️ CORS対応
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/nearest-news' && request.method === 'GET') {
      const query = url.searchParams.get('text') || '';
      const topN = parseInt(url.searchParams.get('limit') || '3', 10);
      await loadJSON();

      if (!query.trim()) {
        return createCORSResponse({ error: 'Missing query parameter: text' }, 400);
      }

      console.log("🔍 Query:", query);

      // ✅ 類似度スコア計算
      const scored = validRecords
        .map((r) => {
          const score = simpleSimilarityScore(`${r.title} ${r.body}`, query);
          return { ...r, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

      return createCORSResponse({ input: query, matches: scored });
    }

    return new Response('Not found', {
      status: 404,
      headers: {
        'Access-Control-Allow-Origin': '*', // 404にも必要
      },
    });
  },
};
