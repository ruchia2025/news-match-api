const CSV_URL = "https://script.google.com/macros/s/AKfycbx0Un_DrZIpEsgXacxeRV3rZbOfoFB2fl45O0_09D-FrxgfRrtPw4H5fUy2S2s3BuCqXg/exec";

// コサイン類似度の計算
function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return magA === 0 || magB === 0 ? 0 : dot / (magA * magB);
}

// テキストから疑似ベクトルを生成（安全版）
async function embed(text: string): Promise<number[]> {
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0); // 空要素除去
  const vec = Array(300).fill(0);
  for (const word of words) {
    const code = word.charCodeAt(0);
    if (isNaN(code)) continue;
    for (let i = 0; i < 300; i++) {
      vec[i] += Math.sin(code * (i + 1));
    }
  }
  return vec;
}

// CSVからニュースリストを抽出
async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL);
  const text = await res.text();

  const lines = text.split('\n').slice(1).filter(line => line.trim().length > 0);

  const news = lines
    .map((line, idx) => {
      const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // カンマ区切り（""対応）

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
    console.log(`[DEBUG] Sample news: ${news[0].title.slice(0, 50)}...`);
  }

  return news;
}

// メインAPIエントリポイント
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/nearest-news") {
      const inputText = url.searchParams.get("text") || "";
      console.log(`[INPUT TEXT] ${inputText}`);

      if (!inputText) {
        return new Response(JSON.stringify({ error: "text is required" }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        });
      }

      try {
        const userVec = await embed(inputText);
        const newsList = await fetchNews();

        let bestMatch = null;
        let bestScore = -Infinity;

        for (const news of newsList) {
          const newsVec = await embed(news.content);
          const sim = cosineSimilarity(userVec, newsVec);

          console.log(`[similarity] ${inputText} vs "${news.title}" => ${sim}`);
          console.log(`[DEBUG] User vector (first 5): ${userVec.slice(0, 5).join(", ")}`);
          console.log(`[DEBUG] News vector (first 5): ${newsVec.slice(0, 5).join(", ")}`);

          if (sim > bestScore) {
            bestScore = sim;
            bestMatch = news;
          }
        }

        return new Response(
          JSON.stringify({
            input: inputText,
            title: bestMatch?.title || null,
            url: bestMatch?.url || null,
            similarity: bestScore.toFixed(4),
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: "internal error", details: `${err}` }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    // ルートパスのレスポンス
    return new Response("✅ news-match API is running", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
