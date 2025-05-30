const CSV_URL = "https://script.google.com/macros/s/AKfycbx0Un_DrZIpEsgXacxeRV3rZbOfoFB2fl45O0_09D-FrxgfRrtPw4H5fUy2S2s3BuCqXg/exec";

// Cosine similarity
function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB || 1); // avoid division by zero
}

// 改善版 embed 関数
async function embed(text: string): Promise<number[]> {
  const vec = Array(300).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(w => w);
  for (let word of words) {
    for (let i = 0; i < Math.min(3, word.length); i++) {
      for (let j = 0; j < 300; j++) {
        vec[j] += Math.sin(word.charCodeAt(i) * (j + 1));
      }
    }
  }
  return vec;
}

// CSV→ニュース抽出
async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL);
  const text = await res.text();
  const lines = text.split("\n").slice(1).filter(line => line.trim().length > 0);

  const news = lines.map((line, idx) => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // CSV対応
    const title = cols[2]?.replace(/^"|"$/g, "") || "";
    const body = cols[7]?.replace(/^"|"$/g, "") || "";
    const url = cols[5]?.replace(/^"|"$/g, "") || "";
    const content = `${title}。${body}`;
    return { title, url, content };
  }).filter(n => n.title && n.url && n.content.length > 10);

  console.log(`[fetchNews] loaded ${news.length} items`);
  if (news[0]) console.log(`[DEBUG] Sample news: ${news[0].content.slice(0, 50)}...`);
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
        console.log(`[DEBUG] News list length: ${newsList.length}`);

        if (newsList.length === 0) {
          return new Response(JSON.stringify({ error: "No news data available" }), {
            headers: { "Content-Type": "application/json" },
            status: 500,
          });
        }

        let bestMatch = null;
        let bestScore = -1;

        for (const news of newsList) {
          const newsVec = await embed(news.content);
          const sim = cosineSimilarity(userVec, newsVec);
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
