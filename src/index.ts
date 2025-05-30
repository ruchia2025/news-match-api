const CSV_URL = "https://script.google.com/macros/s/AKfycbx0Un_DrZIpEsgXacxeRV3rZbOfoFB2fl45O0_09D-FrxgfRrtPw4H5fUy2S2s3BuCqXg/exec";

// Utility: Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

// 日本語対応: Simple embedding（文字単位ベクトル化）
async function embed(text: string): Promise<number[]> {
  const chars = text.split(""); // 文字単位に分割
  const vec = Array(300).fill(0);
  for (let ch of chars) {
    const code = ch.charCodeAt(0);
    for (let i = 0; i < 300; i++) {
      vec[i] += Math.sin(code * (i + 1));
    }
  }
  return vec;
}

// CSV取得＆ニュース抽出（C列=タイトル, F列=URL, H列=本文）
async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL);
  const text = await res.text();

  const lines = text.split('\n').slice(1).filter(line => line.trim().length > 0);

  const news = lines
    .map((line, idx) => {
      const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // カンマ考慮
      if (cols.length < 8) {
        console.log(`[SKIP] Line ${idx + 2} skipped due to insufficient columns`);
        return null;
      }

      const title = cols[2]?.replace(/^"|"$/g, "").trim(); // タイトル（C列）
      const body = cols[7]?.replace(/^"|"$/g, "").trim();  // 本文（H列）
      const url = cols[5]?.replace(/^"|"$/g, "").trim();   // URL（F列）

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

// Workerエンドポイント
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

      console.log(`[INPUT TEXT] ${text}`);

      try {
        const userVec = await embed(text);
        const newsList = await fetchNews();
        console.log(`[DEBUG] News list length: ${newsList.length}`);

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
      } catch (e) {
        return new Response(JSON.stringify({ error: "Internal error", details: `${e}` }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    return new Response("✅ News-match API is working!", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
