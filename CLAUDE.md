# TradingQuiz Pro

## What this project is
A skill-assessment web app for **trading education institutes and instructors** (forex, crypto, stocks).
Instructors create chart-based exam questions; students solve them by **drawing on a real candlestick chart**; the instructor gets a class report.

Think "Google Forms, but for chart reading" with a drawing-enabled chart and automatic grading.

## Why it exists
Institutes today test students with Google Forms, Telegram polls or slides. It is manual, unreliable, and they cannot prove students are improving.
Our buyer is the **institute owner / instructor**. The end user is their **students**.

## Current goal: a demo MVP
Purpose: convince a credible trader/institute in a 5-minute demo. Not a production system.
Deploy on Vercel so I can open it on my phone and laptop during meetings.

### Must have (4 things)
1. **Instructor: create a question**
   - Candlestick data (upload CSV, or fetch from Binance public API klines)
   - Choose which drawing tools the student may use (`allowedTools`: e.g. horizontalStraightLine, straightLine, fibonacciLine)
   - Set the correct answer and an explanation
2. **Student: solve a question**
   - Chart with ONLY the allowed drawing tools in the toolbar
   - Submit button, then a **reveal**: the chart continues with the next candles, shows correct/incorrect and the explanation
3. **Instructor: class report**
   - Table of students with scores, "hardest question" card, accuracy per question
4. **Share link**: instructor sends a link; student enters just a name (no real auth for the demo)

### Explicitly NOT in the MVP
Real login/auth, payments, cash prizes, gambling-like mechanics, multi-tenant orgs, AI chat, mobile app, admin panel, marketplace.
Do not add these unless I ask.

## Tech decisions
- **Next.js (App Router) + TypeScript + Tailwind**, single app (not separate repos).
- **Chart: `klinecharts`** (open source, built-in drawing overlays). Check the installed version's API; overlay names include `straightLine`, `horizontalStraightLine`, `rayLine`, `fibonacciLine`, `parallelStraightLine`, `priceChannelLine`.
- Data layer for the demo: seed data + `localStorage`, or a free Neon/Supabase Postgres if persistence across devices is needed. Note: SQLite files do NOT persist on Vercel.
- **Grading must be server-side** (Next.js route handlers). The client must never receive the correct answer before submitting, and must not send an `isCorrect` flag.

## Questions should be objective
Prefer questions with a measurable outcome from the candle data (e.g. "after this setup, does price go up or down?", "place a support line within X% of the true level"). Avoid subjective answers.

## Design
Dark fintech UI, blue/green accents, clean and credible (not hype). Mobile-friendly. Persian (RTL) support later; English first.

## Existing prior work (reference only)
Older prototype repos under github.com/tradingquizco: `backend` (Express + Sequelize + MySQL), `user`, `quizer`, `main` (Next.js). We are NOT reusing them directly. Known problems there: client-sent `isCurrect`, answers exposed in API, no ownership checks, open CORS, `sync({alter:true})`. Do not repeat those.

## Working style
- Build incrementally and run the app after each step. Show me what changed.
- Keep the code simple; no premature abstractions.
- Ask before adding dependencies beyond the above or spending money.
- Commit in small steps with clear messages.
- See `docs/` for the validation plan, MVP scope and roadmap.
