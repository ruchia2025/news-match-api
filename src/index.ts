export default {
  async fetch(request: Request): Promise<Response> {
    return new Response("✅ News-match API is working!", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
