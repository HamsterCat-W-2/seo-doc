import Anthropic from "@anthropic-ai/sdk";
import { NodeHtmlMarkdown } from "node-html-markdown";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────
// Usage: node generate.js --keywords "关键词1,关键词2" --url https://example.com
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

const keywordsRaw = getArg("--keywords");
const siteUrl = getArg("--url");

if (!keywordsRaw || !siteUrl) {
  console.error(
    "用法: node generate.js --keywords \"关键词1,关键词2\" --url https://example.com"
  );
  process.exit(1);
}

const keywords = keywordsRaw
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const primaryKeyword = keywords[0];

// ─── FETCH WEBSITE ────────────────────────────────────────────────────────────
async function fetchSiteContent(url) {
  console.log(`正在抓取网站内容: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SEO-Bot/1.0; +https://github.com/seo-doc)",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Extract text from HTML, cap at 3000 chars to save tokens
    const text = NodeHtmlMarkdown.translate(html).slice(0, 3000);
    console.log(`✓ 抓取成功，提取内容 ${text.length} 字符`);
    return text;
  } catch (err) {
    console.warn(`⚠ 抓取失败 (${err.message})，将跳过网站内容分析`);
    return "";
  }
}

// ─── GENERATE ARTICLE ─────────────────────────────────────────────────────────
async function generateArticle(keywords, siteUrl, siteContent) {
  const client = new Anthropic({
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });

  const siteContext = siteContent
    ? `以下是目标网站的部分内容，用于了解网站主题和风格：\n\n${siteContent}\n\n`
    : "";

  const prompt = `你是一个有真实生活经验和鲜明个人观点的内容创作者。你不是在"写文章"，你是在和一个真实的朋友分享你的亲身体验和看法。请根据以下信息，用这种语气写一篇双语（中英文）SEO内容。

目标关键词：${keywords.join("、")}
主关键词：${primaryKeyword}
目标网站：${siteUrl}

${siteContext}

## 写作人格要求（最重要，必须贯穿全文）

你在写作时要有一个真实的"我"：有过亲身体验，有自己的偏好和立场，敢于直接说"这个好/这个烂/我就用这个"。不是评测编辑，不是内容农场写手，是一个有意见的真人在说话。

具体表现：
- 中文：可以用"我"的视角写，语气像和朋友聊天，但不失内容价值。可以有些口语感，比如"说真的"、"你懂那种感觉吗"、"反正我是这样用的"
- 英文：大量使用缩写（you've, it's, don't, I've, that's），口语化但不幼稚。开头直接代入读者场景。短句收尾要有力：比如 "Pick one. Hit play." / "That's it." / "Done."
- 对 ${siteUrl} 的引用方式：不是"这是一个资源"，而是"这是我用的地方"——像朋友推荐一样自然，不像广告

## 写作风格

根据目标网站的性质判断语气基调：游戏娱乐类用轻松有代入感的语气；工具类用干脆实用的风格；专业服务类用克制但有温度的语气。风格服务于读者，不套模板。

## 核心叙事原则

文章的终点是让读者自然地想去 ${siteUrl}。方法是：先帮读者解决一个真实的困惑或需求，让他们感受到"这篇文章站在我这边"，然后把 ${siteUrl} 作为"我就是用这个解决的"来引出——而不是作为"以下是几个选项之一"。

**严禁**：把 ${siteUrl} 放在和其他平台/产品的并列比较里。它不是候选者，它是答案。

## 写作要求

1. 文章分两部分：先完整中文版，再完整英文版
2. 中文版长度：1200-1500字；英文版长度：800-1000 words
3. 标题：H1 (#) 做文章总标题，H2 (##) 做章节小标题（带编号，标题要具体有力，禁止用"介绍/概述/总结"这种废标题）
4. 主关键词 "${primaryKeyword}" 自然出现 5-10 次，不堆砌
5. 2-3 处 Markdown 内链指向 ${siteUrl}，锚文本要贴合上下文，链接出现时机要让人觉得"点进去看看"是本能反应
6. 结尾 CTA 要直接、有力、像朋友的最后一句话，不是广告文案
7. 内容真实：不夸大，不过度吹捧，有真实判断
8. **格式限制：只用纯文本段落，不得出现表格、无序列表、有序列表**

## 防AI感——严格遵守

- 开篇必须是场景/感受/反常识观点，禁止用数据报告、市场规模开头
- 禁用词：game-changer、seamless、comprehensive、dive into、it's worth noting、landscape、ecosystem、moreover、furthermore、in conclusion、值得注意的是、不可忽视、毋庸置疑、综上所述、总而言之、不言而喻、首先/其次/最后（作为段落开头时）
- 章节长度要有变化，不能每节都一样长，要有短节（2-3句直接说完）也有展开节
- 全文要有一个清晰的视角和立场，不做"中立综述"
- 英文要用真实英文人的表达方式，不是翻译腔的流畅英文
- 结尾不要用感叹号堆砌，一两句干脆的话比三行煽情有力得多

输出格式（严格遵守）：
---CHINESE---
（此处放中文文章全文，使用 Markdown 格式）
---ENGLISH---
（此处放英文文章全文，使用 Markdown 格式）
---END---
`;

  console.log("正在调用 Claude API 生成文章...");

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  process.stdout.write("生成中");
  let dotCount = 0;
  const dotTimer = setInterval(() => {
    process.stdout.write(".");
    dotCount++;
  }, 1000);

  const message = await stream.finalMessage();
  clearInterval(dotTimer);
  process.stdout.write("\n");

  // Extract text (skip thinking blocks)
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

// ─── PARSE & SAVE ─────────────────────────────────────────────────────────────
function parseAndSave(raw, keywords, siteUrl) {
  const chMatch = raw.match(/---CHINESE---([\s\S]*?)---ENGLISH---/);
  const enMatch = raw.match(/---ENGLISH---([\s\S]*?)---END---/);

  const chinese = chMatch ? chMatch[1].trim() : raw;
  const english = enMatch ? enMatch[1].trim() : "";

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const slug = keywords[0]
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const folderName = `${today}-${slug}`;
  const articleDir = path.join(__dirname, "output", folderName);
  if (!fs.existsSync(articleDir)) fs.mkdirSync(articleDir, { recursive: true });

  const meta = `---
date: ${today}
keywords: ${keywords.join(", ")}
site: ${siteUrl}
---

`;

  fs.writeFileSync(path.join(articleDir, "zh.md"), meta + chinese, "utf8");
  fs.writeFileSync(path.join(articleDir, "en.md"), meta + english, "utf8");
  return articleDir;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 SEO文章生成器`);
  console.log(`   关键词: ${keywords.join(", ")}`);
  console.log(`   网站:   ${siteUrl}\n`);

  const siteContent = await fetchSiteContent(siteUrl);
  const raw = await generateArticle(keywords, siteUrl, siteContent);

  if (!raw) {
    console.error("✗ 文章生成失败，未收到内容");
    process.exit(1);
  }

  const filePath = parseAndSave(raw, keywords, siteUrl);
  console.log(`\n✅ 文章已保存: ${filePath}/\n   ├── zh.md\n   └── en.md`);
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
