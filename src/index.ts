const CSV_URL = "https://script.google.com/macros/s/AKfycbx0Un_DrZIpEsgXacxeRV3rZbOfoFB2fl45O0_09D-FrxgfRrtPw4H5fUy2S2s3BuCqXg/exec";

// ユーティリティ: コサイン類似度
function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

// 単純な埋め込みベクトル（文字コードベース）
async function embed(text: string): Promise<number[]> {
  const words = text.toLowerCase().split(/\W+/);
  const vec = Array(300).fill(0);
  for (let word of words) {
    for (let i = 0; i < 300; i++) {
      vec[i] += Math.sin(word.charCodeAt(0) * (i + 1));
    }
  }
  return vec;
}

// ニュースCSVの取得とパース
async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL);
  const text = await res.text();

  const lines = text.split("\n").slice(1).filter(line => line.trim().length > 0);

  const news = lines.map(line => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // カンマの中の引用符を除外
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

// Cloudflare Worker エントリポイント
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

          // 🧠 ログ出力（ここが追加点！）
          console.log(`[DEBUG] Comparing with: ${news.title}`);
          console.log(`[DEBUG] News vector (first 5): ${newsVec.slice(0, 5).join(", ")}`);
          console.log(`[DEBUG] User vector (first 5): ${userVec.slice(0, 5).join(", ")}`);
          console.log(`[DEBUG] Similarity: ${sim}`);

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
