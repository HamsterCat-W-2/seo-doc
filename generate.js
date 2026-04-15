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
const anglesRaw = getArg("--angles");
const lang = getArg("--lang"); // e.g. "Bahasa Indonesia" — defaults to English

if (!keywordsRaw || !siteUrl) {
  console.error(
    "用法: node generate.js --keywords \"关键词1,关键词2\" --url https://example.com [--angles \"角度1,角度2\"] [--lang \"Bahasa Indonesia\"]"
  );
  process.exit(1);
}

const angles = anglesRaw
  ? anglesRaw.split(",").map((a) => a.trim()).filter(Boolean)
  : [];

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

// ─── FIND EXISTING ARTICLES (for dedup) ──────────────────────────────────────
function findExistingArticles(keywords) {
  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) return [];

  const slug = keywords[0]
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const dirs = fs.readdirSync(outputDir).filter((d) => d.endsWith(slug));
  const articles = [];
  for (const dir of dirs) {
    const zhPath = path.join(outputDir, dir, "zh.md");
    if (fs.existsSync(zhPath)) {
      const content = fs.readFileSync(zhPath, "utf8");
      // Strip frontmatter
      const body = content.replace(/^---[\s\S]*?---\n*/, "").trim();
      if (body) articles.push({ date: dir.slice(0, 10), content: body.slice(0, 2000) });
    }
  }
  return articles;
}

// ─── GENERATE ARTICLE ─────────────────────────────────────────────────────────
async function generateArticle(keywords, siteUrl, siteContent, angles = [], existingArticles = [], lang = "English") {
  const client = new Anthropic({
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });

  const siteContext = siteContent
    ? `以下是目标网站的部分内容，用于了解网站主题和风格：\n\n${siteContent}\n\n`
    : "";

  const anglesContext = angles.length
    ? `## 写作角度参考（仅供启发，非写作提纲）\n\n以下角度仅作为思路参考。你不需要覆盖所有角度，也不能按角度逐一展开——选择最能支撑文章核心叙事的一两个视角自然融入即可。角度是切入点，不是章节结构：\n${angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\n`
    : "";

  const dedupContext = existingArticles.length
    ? `## 已有文章（必须避免重复）\n\n以下是同一关键词已经发布过的文章。你这次写的文章**必须**与它们在以下方面完全不同：标题、开篇切入点、章节结构、核心论点、举例和细节。不能用类似的叙事弧线，不能重复相同的功能卖点排列顺序。如果已有文章讲了安装流程，你可以只用一两句带过，把篇幅留给完全不同的内容。\n\n${existingArticles.map((a) => `### 已有文章 (${a.date})\n${a.content}`).join("\n\n")}\n\n`
    : "";

  const prompt = `你是一个有真实经验和独立判断的内容创作者。请根据以下信息写一篇SEO文章，风格有个人视角，但语言精炼克制，不口语化。

目标关键词：${keywords.join("、")}
主关键词：${primaryKeyword}
目标网站：${siteUrl}

${siteContext}
${anglesContext}
${dedupContext}

## 语言要求

文章分两部分：第一部分中文，第二部分${lang}。两部分各自独立成文，不是互译。

## 写作人格要求

文章要有"我"的视角和立场——有亲身体验，有明确判断，敢于说"这个值得用/这个不行"。但这个"我"是一个表达克制、有观察力的作者，不是在跟朋友发消息的人。

具体要求：
- 中文：用第一人称写，有真实感，但避免口头禅式表达（去掉"说真的"、"你懂那种感觉吗"、"反正"这类词）。语气像一篇写得好的专栏文章——有态度，但不随意
- ${lang}：用该语言自然的写作习惯，保持专业但有人格感。${lang === "English" ? "使用自然缩写（you've, it's, don't, I've），语气直接有力，但不口语化到像 SMS。结尾句要干脆，不是堆感叹号，也不是过于俏皮的\"Done.\" / \"That's it.\"" : ""}
- 对 ${siteUrl} 的引用：像一个有经验的人分享自己真正在用的东西，自然但有分量

## 写作风格

根据目标网站的性质判断语气基调：游戏娱乐类轻松但不浮躁；工具类直接实用；专业服务类克制有温度。避免模板化。

## 核心叙事原则

文章的终点是让读者自然地想去 ${siteUrl}。先解决读者一个真实困惑，建立信任，然后把 ${siteUrl} 作为"我就是这样解决的"来引出——不是候选项之一，是答案。

**严禁**：把 ${siteUrl} 和其他平台并列比较，让它变成"选项之一"。

## 写作要求

1. 文章分两部分：先完整中文版，再完整英文版
2. 中文版长度：1200-1500字；英文版长度：800-1000 words
3. 标题：H1 (#) 做文章总标题，H2 (##) 做章节小标题（带编号，标题要具体有力，禁止"介绍/概述/总结"）。**标题中禁止直接原样粘贴关键词短语**。关键词是搜索词（如 "MovieBox APK Download"），语法上不完整，不能直接当名词、主语或宾语使用。标题必须是语法完整、语义通顺的自然句子。错误示例："MovieBox APK Download Is the Best Choice"、"一个 MovieBox APK Download 的指南"。正确做法：把关键词中的概念用自然语言重新表达，如"如何安全下载 MovieBox APK"、"Why You Should Download MovieBox APK Instead"
4. 关键词使用原则：主关键词 "${primaryKeyword}" 在全文中以完整形式出现 5-10 次。大多数情况下必须保持关键词原样完整出现，这是 SEO 的硬性需求。但如果某处完整关键词会让句子非常生硬不自然，允许偶尔（不超过 2-3 次）使用变体或缩写形式。关键词应该融入句子的自然语流中，不要为了凑次数而在不合适的位置强行插入
5. 2-3 处 Markdown 内链指向 ${siteUrl}，锚文本贴合上下文，出现时机自然
6. 结尾 CTA 有力但不煽情，是作者最后一句真心话，不是广告语；禁止使用"自己试一下""用一次就能判断""你会明白我在说什么"等重复套话，结尾要从文章自身的具体论点生长出来
7. 内容真实：不夸大，不过度吹捧，判断有依据
8. **格式限制：只用纯文本段落，不得出现表格、无序列表、有序列表**
9. 每个涉及多点列举或多功能介绍的章节，正文开头必须先写一两句铺垫（preamble），说明这一节要讲什么、为什么重要，再展开具体内容——禁止直接以"第一…第二…"或"先说…再说…"起头

## 防AI感——严格遵守

- 开篇用场景/感受/反常识观点切入，禁止数据报告、市场规模开头
- 禁用词：game-changer、seamless、comprehensive、dive into、it's worth noting、landscape、ecosystem、moreover、furthermore、in conclusion、值得注意的是、不可忽视、毋庸置疑、综上所述、总而言之、不言而喻、说真的（作为口头禅使用时）
- 禁止根据域名后缀推测网站的国家属性或目标市场（如 .ph 不等于菲律宾产品，.io 不等于英国产品），只根据网站实际内容判断
- 禁用场景标签：避免"出差时"、"通勤路上"、"飞机上"这类无细节的公式化标签；如需用生活场景，必须写出具体的画面（时间、情境、感受），不能只贴一个标签
- 章节长度有变化，不能每节等长
- 全文有清晰视角和立场，不做"中立综述"
- 中英文各自要有对应语言真实的语感，不是互译

输出格式（严格遵守）：
---CHINESE---
（此处放中文文章全文，使用 Markdown 格式）
---ENGLISH---
（此处放${lang}文章全文，必须用${lang}写作，不是英文，不是中文，是${lang}。使用 Markdown 格式）
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

// ─── LANGUAGE CODE MAP ─────────────────────────────────────────────────────────
const langCodeMap = {
  "english": "en",
  "bahasa indonesia": "id",
  "indonesian": "id",
  "japanese": "ja",
  "korean": "ko",
  "spanish": "es",
  "french": "fr",
  "portuguese": "pt",
  "thai": "th",
  "vietnamese": "vi",
  "filipino": "fil",
  "malay": "ms",
  "arabic": "ar",
  "hindi": "hi",
};

function getLangCode(lang) {
  const key = (lang || "English").toLowerCase().trim();
  return langCodeMap[key] || key.slice(0, 2).toLowerCase();
}

// ─── PARSE & SAVE ─────────────────────────────────────────────────────────────
function parseAndSave(raw, keywords, siteUrl, lang = "English") {
  const chMatch = raw.match(/---CHINESE---([\s\S]*?)---ENGLISH---/);
  const enMatch = raw.match(/---ENGLISH---([\s\S]*?)---END---/);

  const chinese = chMatch ? chMatch[1].trim() : raw;
  const secondLang = enMatch ? enMatch[1].trim() : "";

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

  const langFile = `${getLangCode(lang)}.md`;
  fs.writeFileSync(path.join(articleDir, "zh.md"), meta + chinese, "utf8");
  fs.writeFileSync(path.join(articleDir, langFile), meta + secondLang, "utf8");
  return { articleDir, chinese, secondLang, langFile };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 SEO文章生成器`);
  console.log(`   关键词: ${keywords.join(", ")}`);
  console.log(`   网站:   ${siteUrl}`);
  if (angles.length) console.log(`   角度:   ${angles.join(" / ")}`);
  console.log("");

  const siteContent = await fetchSiteContent(siteUrl);
  const existingArticles = findExistingArticles(keywords);
  if (existingArticles.length) {
    console.log(`📎 发现 ${existingArticles.length} 篇同关键词旧文章，将自动去重`);
  }
  const effectiveLang = lang || "English";
  const raw = await generateArticle(keywords, siteUrl, siteContent, angles, existingArticles, effectiveLang);

  if (!raw) {
    console.error("✗ 文章生成失败，未收到内容");
    process.exit(1);
  }

  const { articleDir, langFile } = parseAndSave(raw, keywords, siteUrl, effectiveLang);
  console.log(`\n✅ 文章已保存: ${articleDir}/\n   ├── zh.md\n   └── ${langFile}`);
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
