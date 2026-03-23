import Anthropic from "@anthropic-ai/sdk";
import { NodeHtmlMarkdown } from "node-html-markdown";
import puppeteer from "puppeteer";
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

if (!keywordsRaw || !siteUrl) {
  console.error(
    "用法: node generate.js --keywords \"关键词1,关键词2\" --url https://example.com [--angles \"角度1,角度2\"]"
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

// ─── GENERATE ARTICLE ─────────────────────────────────────────────────────────
async function generateArticle(keywords, siteUrl, siteContent, angles = []) {
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

  const prompt = `你是一个有真实经验和独立判断的内容创作者。请根据以下信息写一篇双语（中英文）SEO文章，风格有个人视角，但语言精炼克制，不口语化。

目标关键词：${keywords.join("、")}
主关键词：${primaryKeyword}
目标网站：${siteUrl}

${siteContext}
${anglesContext}

## 写作人格要求

文章要有"我"的视角和立场——有亲身体验，有明确判断，敢于说"这个值得用/这个不行"。但这个"我"是一个表达克制、有观察力的作者，不是在跟朋友发消息的人。

具体要求：
- 中文：用第一人称写，有真实感，但避免口头禅式表达（去掉"说真的"、"你懂那种感觉吗"、"反正"这类词）。语气像一篇写得好的专栏文章——有态度，但不随意
- 英文：使用自然缩写（you've, it's, don't, I've），语气直接有力，但不口语化到像 SMS。结尾句要干脆，不是堆感叹号，也不是过于俏皮的"Done." / "That's it."
- 对 ${siteUrl} 的引用：像一个有经验的人分享自己真正在用的东西，自然但有分量

## 写作风格

根据目标网站的性质判断语气基调：游戏娱乐类轻松但不浮躁；工具类直接实用；专业服务类克制有温度。避免模板化。

## 核心叙事原则

文章的终点是让读者自然地想去 ${siteUrl}。先解决读者一个真实困惑，建立信任，然后把 ${siteUrl} 作为"我就是这样解决的"来引出——不是候选项之一，是答案。

**严禁**：把 ${siteUrl} 和其他平台并列比较，让它变成"选项之一"。

## 写作要求

1. 文章分两部分：先完整中文版，再完整英文版
2. 中文版长度：1200-1500字；英文版长度：800-1000 words
3. 标题：H1 (#) 做文章总标题，H2 (##) 做章节小标题（带编号，标题要具体有力，禁止"介绍/概述/总结"）
4. 主关键词 "${primaryKeyword}" 自然出现 5-10 次，不堆砌
5. 2-3 处 Markdown 内链指向 ${siteUrl}，锚文本贴合上下文，出现时机自然
6. 结尾 CTA 有力但不煽情，是作者最后一句真心话，不是广告语
7. 内容真实：不夸大，不过度吹捧，判断有依据
8. **格式限制：只用纯文本段落，不得出现表格、无序列表、有序列表**

## 防AI感——严格遵守

- 开篇用场景/感受/反常识观点切入，禁止数据报告、市场规模开头
- 禁用词：game-changer、seamless、comprehensive、dive into、it's worth noting、landscape、ecosystem、moreover、furthermore、in conclusion、值得注意的是、不可忽视、毋庸置疑、综上所述、总而言之、不言而喻、说真的（作为口头禅使用时）
- 章节长度有变化，不能每节等长
- 全文有清晰视角和立场，不做"中立综述"
- 中英文各自要有对应语言真实的语感，不是互译

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
  return { articleDir, chinese, english };
}

// ─── PLAN SCREENSHOTS ─────────────────────────────────────────────────────────
async function planScreenshots(chineseArticle, siteUrl) {
  const client = new Anthropic({
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });

  const result = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    tools: [
      {
        name: "screenshot_plan",
        description: "根据文章内容规划截图方案",
        input_schema: {
          type: "object",
          properties: {
            screenshots: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string", description: "要截图的完整URL" },
                  filename: { type: "string", description: "截图文件名，如 screenshot-homepage.png" },
                  insertAfterHeading: { type: "string", description: "插入到哪个H2标题之后，如 '## 1.' 或 '## 3.'" },
                },
                required: ["url", "filename", "insertAfterHeading"],
              },
              minItems: 1,
              maxItems: 3,
            },
          },
          required: ["screenshots"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "screenshot_plan" },
    messages: [
      {
        role: "user",
        content: `你是一个SEO内容策略师。根据以下文章内容和目标网站，判断需要截哪些页面的截图（1-3张），以及每张截图应插入到文章的哪个H2章节之后。

目标网站：${siteUrl}

截图选择原则：
- 优先截文章中明确提到或展示的页面（如首页、某个分类页、某个功能页）
- 截图应该能直观印证文章的观点，让读者看了觉得"原来是这个样子"
- 如果文章提到具体分类/功能，可以截对应子页面（如 ${siteUrl}category/puzzle）
- 插入位置选择文章中最能和截图内容呼应的章节

文章内容：
${chineseArticle.slice(0, 2000)}`,
      },
    ],
  });

  const toolUse = result.content.find((b) => b.type === "tool_use");
  if (!toolUse) return [];
  return toolUse.input.screenshots || [];
}

// ─── TAKE SCREENSHOTS ─────────────────────────────────────────────────────────
async function takeScreenshots(shots, articleDir) {
  if (!shots.length) return;
  console.log(`\n正在截图 (${shots.length} 张)...`);

  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const shot of shots) {
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(shot.url, { waitUntil: "networkidle2", timeout: 20000 });
        const filePath = path.join(articleDir, shot.filename);
        await page.screenshot({ path: filePath, fullPage: false });
        await page.close();
        console.log(`  ✓ ${shot.filename}`);
      } catch (err) {
        console.warn(`  ⚠ 截图失败 ${shot.url}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }
}

// ─── INSERT SCREENSHOTS INTO MARKDOWN ─────────────────────────────────────────
function insertScreenshots(mdContent, shots) {
  let result = mdContent;
  for (const shot of shots) {
    const headingPrefix = shot.insertAfterHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headingRegex = new RegExp(`${headingPrefix}[^\n]*\n`, "m");
    const match = headingRegex.exec(result);
    if (!match) continue;

    // Find the first paragraph after the heading (skip blank lines after heading)
    const afterHeading = result.slice(match.index + match[0].length);
    // Find end of first paragraph: look for a blank line after non-empty content
    const firstParaMatch = afterHeading.match(/\n\n/);
    const insertOffset = firstParaMatch
      ? match.index + match[0].length + firstParaMatch.index + 2
      : match.index + match[0].length + afterHeading.length;

    const imgMarkdown = `![${shot.filename}](./${shot.filename})\n\n`;
    result = result.slice(0, insertOffset) + imgMarkdown + result.slice(insertOffset);
  }
  return result;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 SEO文章生成器`);
  console.log(`   关键词: ${keywords.join(", ")}`);
  console.log(`   网站:   ${siteUrl}`);
  if (angles.length) console.log(`   角度:   ${angles.join(" / ")}`);
  console.log("");

  const siteContent = await fetchSiteContent(siteUrl);
  const raw = await generateArticle(keywords, siteUrl, siteContent, angles);

  if (!raw) {
    console.error("✗ 文章生成失败，未收到内容");
    process.exit(1);
  }

  const { articleDir, chinese, english } = parseAndSave(raw, keywords, siteUrl);
  console.log(`\n✅ 文章已保存: ${articleDir}/\n   ├── zh.md\n   └── en.md`);

  // Plan and take screenshots
  console.log("\n正在规划截图方案...");
  const shots = await planScreenshots(chinese, siteUrl);
  if (shots.length) {
    await takeScreenshots(shots, articleDir);

    // Insert screenshot references into both markdown files
    const zhPath = path.join(articleDir, "zh.md");
    const enPath = path.join(articleDir, "en.md");
    fs.writeFileSync(zhPath, insertScreenshots(fs.readFileSync(zhPath, "utf8"), shots), "utf8");
    fs.writeFileSync(enPath, insertScreenshots(fs.readFileSync(enPath, "utf8"), shots), "utf8");
    console.log(`✅ 截图已插入文章`);
  } else {
    console.log("⚠ 未生成截图方案");
  }
}

main().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
