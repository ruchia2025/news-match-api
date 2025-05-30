// src/index.ts
const CSV_URL = "https://script.google.com/macros/s/AKfycbzODIn3eJpMBNkj8rrrUcAb6lVAFSirutEG_syHmMfNPRK_6MxpPY7OWv8EqARYA1Igeg/exec";

// Utility: Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (magA * magB);
}

// Lightweight SBERT-like embedding (代替用API or簡易疑似ベクトル)
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

async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL);
  const text = await res.text();
  const lines = text.split("\n").slice(1); // skip header

  const news = lines.map(line => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // CSV safe split
    const title = cols[2]?.replace(/^"|"$/g, "") || "";
    const body = cols[7]?.replace(/^"|"$/g, "") || "";
    const url = cols[5]?.replace(/^"|"$/g, "") || "";
    return {
      title,
      url,
      content: `${title}。${body}`,
    };
  }).filter(item => item.title && item.url);

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

        let bestMatch = null;
        let bestScore = -Infinity;

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
        return new Response(JSON.stringify({ error: "Internal error", details: e }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    // default route
    return new Response("✅ News-match API is working!", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
