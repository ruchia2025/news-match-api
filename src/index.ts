import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()
app.use(cors())

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2ZqgAVqlc3T4KzwL3y_UFJ3zEfEChN_H0zHEytJ_T1aORpAtwZ9QaGNMscUpF92zthmUdfga31S_F/pub?output=csv'

// 類似度計算（文字単位で日本語対応）
function similarity(a: string, b: string): number {
  const tokenize = (text: string) => Array.from(text).filter(c => c.trim())
  const aTokens = tokenize(a)
  const bTokens = tokenize(b)
  const setA = new Set(aTokens)
  const setB = new Set(bTokens)
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.size / union.size
}

// CSVを取得・パースして {title, url, content} を返す
async function fetchNews(): Promise<{ title: string; url: string; content: string }[]> {
  const res = await fetch(CSV_URL)
  const text = await res.text()
  const lines = text.split('\n').slice(1).filter(line => line.trim().length > 0)

  let skipCount = 0
  let shownSkips = 0

  const news = lines
    .map((line, idx) => {
      const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      if (cols.length < 8) {
        skipCount++
        if (shownSkips < 10) {
          console.log(`[SKIP] Line ${idx + 2} skipped due to insufficient columns`)
          shownSkips++
        }
        return null
      }

      const title = cols[2]?.replace(/^"|"$/g, "").trim()
      const body = cols[7]?.replace(/^"|"$/g, "").trim()
      const url = cols[5]?.replace(/^"|"$/g, "").trim()
      const content = `${title}。${body}`.trim()

      return (title && body && url && content)
        ? { title, url, content }
        : null
    })
    .filter((item): item is { title: string; url: string; content: string } => item !== null)

  console.log(`[fetchNews] loaded ${news.length} items (skipped ${skipCount} invalid rows)`)
  return news
}

// 最も類似したニュースを返す
app.get('/api/nearest-news', async (c) => {
  const input = c.req.query('text') || ''
  if (!input.trim()) return c.json({ error: 'No input provided' }, 400)

  const newsList = await fetchNews()
  console.log(`[DEBUG] News list length: ${newsList.length}`)

  const ranked = newsList
    .map(item => ({
      ...item,
      similarity: similarity(input, item.content)
    }))
    .sort((a, b) => b.similarity - a.similarity)

  const top = ranked.slice(0, 3).filter(item => item.similarity > 0)

  for (const item of top) {
    console.log(`[similarity] ${input} vs "${item.title}" => ${item.similarity.toFixed(3)}`)
  }

  return c.json({ input, results: top })
})

export default app
