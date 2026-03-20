# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Daily SEO article generator. User provides keywords and a website URL; the tool fetches the site, then calls Claude API to produce a bilingual (Chinese + English) SEO article in Markdown with internal links.

## Commands

```bash
# Install dependencies
npm install

# Generate an article
node generate.js --keywords "关键词1,关键词2" --url https://example.com
```

Output files are saved to `output/YYYY-MM-DD-<keyword>.md`.

## Article Requirements

- **H1** (`#`) for the article title; **H2** (`##`) for all numbered section headings (e.g. `## 1. 标题`)
- Primary keyword used **5–10 times** naturally throughout the article (no stuffing)
- **2–3 internal links** pointing to the target website, with contextually relevant anchor text
- Chinese version: 1200–1500 字; English version: 800–1000 words
- Includes intro, body sections, and a CTA closing
- Content is professional and objective — no exaggeration or over-promotion
- Underlying goal: guide readers to visit the target website naturally; the article builds trust through valuable content so that clicking through feels like a logical next step, not a sales pitch

## Writing Styles (random each run)

Five styles rotate randomly per generation:
1. **专家分析型** — Expert analysis, data/research-backed, rigorous and objective
2. **实用指南型** — Practical guide, step-by-step, immediately actionable
3. **问题解答型** — Q&A format, addresses reader pain points, advisory tone
4. **对比分析型** — Comparison of methods/options, neutral and balanced
5. **数据驱动型** — Statistics and cases as core evidence, precise language

## Architecture

- `generate.js` — single entry point (ES module)
  - Parses `--keywords` and `--url` CLI args
  - Fetches website HTML, converts to markdown (capped at 3000 chars) for site-theme context
  - Calls `claude-opus-4-6` with `thinking: {type: "adaptive"}` and streams the response
  - Splits raw output on `---CHINESE---` / `---ENGLISH---` / `---END---` delimiters
  - Writes final file to `output/`
- `output/` — generated articles (gitignored recommended)

## Environment

Requires `ANTHROPIC_API_KEY` set in the shell environment.
