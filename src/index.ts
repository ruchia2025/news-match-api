const CSV_URL = "https://script.google.com/macros/s/AKfycbx0Un_DrZIpEsgXacxeRV3rZbOfoFB2fl45O0_09D-FrxgfRrtPw4H5fUy2S2s3BuCqXg/exec";

// Utility: Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0) return -Infinity;
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  if (magA === 0 || magB === 0) return -Infinity;
  return dot / (magA * magB);
}

// Simple embedding (300次元ベクトル生成)
async function embed(text: string): Promise<number[]> {
  if (!text) return Array(300).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const vec = Array(300).fill(0);
  for (let word of words) {
    for (let i = 0; i < 300; i++) {
      vec[i] += Math.sin(word.charCodeAt(0) * (i + 1));
    }
  }
  return vec;
}

// CSVを取得してニュースリストに変換
async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL);
  const text = await res.text();

  const lines = text.split("\n").slice(1).filter(line => line.trim().length > 0);

  const news = lines.map((line, idx) => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const title = cols[2]?.replace(/^"|"$/g, "") || "";
    const body = cols[7]?.replace(/^"|"$/g, "") || "";
    const url = cols[5]?.replace(/^"|"$/g, "") || "";
    return {
      title,
      url,
      content: `${title}。${body}`,
    };
  }).filter(item => item.title && item.url);

  console.log(`[fetchNews] loaded ${news.length} items`);
  return news;
}

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
          console.log(`[similarity] ${text} vs "${news.title}" => ${sim.toFixed(4)}`);
          if (sim > bestScore) {
            bestScore = sim;
            bestMatch = news;
          }
        }

        return new Response(
          JSON.stringify({
            input: text,
            title: bestMatch?.title || null,
            url: bestMatch?.url || null,
            similarity: isFinite(bestScore) ? bestScore.toFixed(4) : "-Infinity",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (e) {
        console.log(`[ERROR] ${e}`);
        return new Response(JSON.stringify({ error: "Internal error", details: `${e}` }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    // Default
    return new Response("✅ News-match API is working!", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
