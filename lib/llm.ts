import OpenAI from 'openai';
import type { ArticleSummary } from './types';

const API_KEY = process.env.DEEPSEEK_API_KEY || '';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const SYSTEM_PROMPT = `你是一位资深财经分析师。请对财经文章做摘要分析。
输出必须是严格 JSON，不要额外文字，不要 markdown 代码块。

JSON 格式：
{
  "summary": "3-4句话摘要，抓住核心观点和论据",
  "tags": ["标签1", "标签2"],
  "stance": "bullish" | "bearish" | "neutral",
  "confidence": 0.8
}

标签候选：房地产、降息降准、A股大盘、海外市场、AI算力、大宗商品、汇率、债市、宏观政策、地缘政治、行业选股、加密货币、消费、新能源
stance: bullish=看多/bearish=看空/neutral=中性`;

export async function summarizeArticle(
  title: string,
  author: string,
  date: string,
  text: string
): Promise<ArticleSummary> {
  const content = `文章标题：${title}
发布时间：${date}
作者：${author}

正文：
${text.slice(0, 8000)}`;

  const res = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
    max_tokens: 800,
  });

  const raw = res.choices[0].message.content || '{}';
  const parsed = JSON.parse(raw);
  return {
    summary: parsed.summary || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    stance: ['bullish', 'bearish', 'neutral'].includes(parsed.stance) ? parsed.stance : 'neutral',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  };
}

const COMPARE_SYSTEM = `你是资深宏观策略分析师。根据今天所有财经博主的观点摘要，进行横向比较分析。
输出 Markdown 格式（不要 JSON），包含三个板块。`;

export async function compareDaily(summariesText: string): Promise<string> {
  const userPrompt = `以下是今天所有财经博主的观点摘要（共若干条），请做横向比较分析：

## 一、今日共识
列出今天多数人（≥3人）看法一致的主题。每个主题说明共识内容和主要支持者。

## 二、今日分歧
列出出现明显对立观点的主题。每个分歧说明：
- 分歧双方（谁 vs 谁）
- 各自核心论据
- 你的判断：这是大方向判断分歧，还是短期节奏分歧？

## 三、今日看点
今天最值得关注的 1-2 件事，一句话说清为什么重要。

${summariesText}`;

  const res = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: COMPARE_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  });

  return res.choices[0].message.content || '';
}
