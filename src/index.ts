const CSV_URL = "https://script.google.com/macros/s/AKfycbx0Un_DrZIpEsgXacxeRV3rZbOfoFB2fl45O0_09D-FrxgfRrtPw4H5fUy2S2s3BuCqXg/exec";

// Cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

// Embedding（簡易版）
async function embed(text: string): Promise<number[]> {
  const words = text.toLowerCase().split(/\W+/);
  const vec = Array(300).fill(0);
  for (const word of words) {
    for (let i = 0; i < 300; i++) {
      vec[i] += Math.sin(word.charCodeAt(0) * (i + 1));
    }
  }
  return vec;
}

// CSVからニュースを取得
async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL);
  const text = await res.text();

  const lines = text.split('\n').slice(1).filter(line => line.trim().length > 0);

  const news = lines
    .map((line, idx) => {
      const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // 正規表現カンマ分割

      if (cols.length < 8) {
        console.log(`[SKIP] Line ${idx + 2} skipped due to insufficient columns`);
        return null;
      }

      const title = cols[2]?.replace(/^"|"$/g, "").trim();
      const body = cols[7]?.replace(/^"|"$/g, "").trim();
      const url = cols[5]?.replace(/^"|"$/g, "").trim();
      const content = `${title}。${body}`.trim();

      return (title && body && url && content)
        ? { title, url, content }
        : null;
    })
    .filter((item): item is { title: string; url: string; content: string } => item !== null);

  console.log(`[fetchNews] loaded ${news.length} items`);
  if (news.length > 0) {
    console.log(`[DEBUG] Sample: ${news[0].title.slice(0, 50)}...`);
  }

  return news;
}

// メインハンドラー
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/nearest-news") {
      const text = url.searchParams.get("text") || "";

      if (!text) {
        return new Response(JSON.stringify({ error: "text is required" }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        });
      }

      try {
        const userVec = await embed(text);
        const newsList = await fetchNews();

        if (newsList.length === 0) {
          return new Response(JSON.stringify({ error: "No news data available" }), {
            headers: { "Content-Type": "application/json" },
            status: 500,
          });
        }

        let bestMatch = null;
        let bestScore = -Infinity;

        for (const news of newsList) {
          const newsVec = await embed(news.content);
          const sim = cosineSimilarity(userVec, newsVec);

          console.log(`[similarity] ${text} vs "${news.title}" => ${sim}`);

          if (sim > bestScore) {
            bestScore = sim;
            bestMatch = news;
          }
        }

        return new Response(
          JSON.stringify({
            input: text,
            title: bestMatch?.title,
            url: bestMatch?.url,
            similarity: bestScore.toFixed(4),
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: "Internal error", detail: `${err}` }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    // default path
    return new Response("✅ News-match API is running", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
