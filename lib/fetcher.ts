import axios from 'axios';
import * as cheerio from 'cheerio';

/** 抓取网页正文 */
export async function fetchArticle(url: string): Promise<{
  title: string;
  text: string;
  html: string;
  isSPA: boolean;
}> {
  const { data: html } = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    // 关键：让 axios 不自动解码，我们手动处理
    responseType: 'arraybuffer',
  });

  // 手动解码（优先 UTF-8）
  const raw = Buffer.from(html);
  const encoding = detectEncoding(raw);
  const decoded = raw.toString(encoding as BufferEncoding);

  const $ = cheerio.load(decoded);

  // 去掉无用元素
  $('script, style, nav, footer, header, aside, .sidebar, .comment, .ad, iframe, noscript, svg').remove();

  // 标题：按优先级尝试
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    url;

  // 正文：多策略提取
  let text = '';

  // 策略 1: <article> 标签
  const articleEl = $('article');
  if (articleEl.length > 0) {
    text = articleEl.text();
  }

  // 策略 2: 常见内容容器
  if (!text || text.length < 100) {
    const contentSelectors = [
      '.article-content', '.article-body', '.post-content', '.post-body',
      '.content', '.rich_media_content', '#article-content', '.entry-content',
      '.article__content', '.detail-content',
    ];
    for (const sel of contentSelectors) {
      const el = $(sel);
      if (el.length > 0) {
        const t = el.text().trim();
        if (t.length > text.length) text = t;
      }
    }
  }

  // 策略 3: 聚合所有 <p> 标签
  if (!text || text.length < 100) {
    text = $('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((t: string) => t.length > 15)
      .join('\n\n');
  }

  // 策略 4: body 全文（最后兜底）
  if (!text || text.length < 100) {
    text = $('body').text();
  }

  // 清洗
  text = text.replace(/[\t ]{3,}/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim();

  // 判断是否为 SPA（正文很少 = 可能是 JS 动态渲染的）
  const isSPA = text.length < 200;

  return { title: title.slice(0, 200), text, html: decoded, isSPA };
}

/** 简易编码检测 */
function detectEncoding(buf: Buffer): string {
  // 检查 BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf-8';
  if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be';
  if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le';

  // 检查 HTML meta charset
  const head = buf.toString('ascii', 0, 1024);
  const charsetMatch = head.match(/charset[="\s]+([^"\s;]+)/i);
  if (charsetMatch) {
    const cs = charsetMatch[1].toLowerCase();
    if (cs.includes('gb') || cs.includes('gbk')) return 'gbk';
    if (cs.includes('utf-8') || cs.includes('utf8')) return 'utf-8';
    if (cs.includes('big5')) return 'big5';
  }

  return 'utf-8';
}

/** 抓取 RSS/XML 并解析条目 */
export async function fetchRSS(url: string): Promise<
  Array<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
    author: string;
  }>
> {
  const { data: xml } = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  return parseRSS(xml);
}

export function parseRSS(xml:string){
  if (typeof xml !== 'string' || !/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('来源未返回有效 RSS/Atom，保留最近成功结果');
  const $ = cheerio.load(xml, { xmlMode: true });

  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
    author: string;
  }> = [];

  $('item, entry').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const link =
      $(el).find('link').first().text().trim() ||
      $(el).find('link').attr('href') ||
      '';
    const pubDate =
      $(el).find('pubDate').first().text().trim() ||
      $(el).find('published').first().text().trim() ||
      $(el).find('updated').first().text().trim() ||
      $(el).find('dc\\:date').first().text().trim() ||
      '';
    const description =
      $(el).find('description').first().text().trim() ||
      $(el).find('content\\:encoded').text().trim() ||
      $(el).find('content').text().trim() ||
      $(el).find('summary').text().trim() ||
      '';
    // 真实作者：RSS 的 <author> 或 Atom 的 <dc:creator> / <name>
    const author =
      $(el).find('author').first().text().trim() ||
      $(el).find('dc\\:creator').text().trim() ||
      $(el).find('creator').text().trim() ||
      $(el).find('name').first().text().trim() ||
      '';

    if (title && link) {
      items.push({ title, link, pubDate, description, author });
    }
  });

  return items;
}
