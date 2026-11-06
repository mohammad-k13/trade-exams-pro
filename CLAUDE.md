# TradingQuiz Pro

## What this project is
A skill-assessment web app for **trading education institutes and instructors** (forex, crypto, stocks).
Instructors create chart-based exam questions; students solve them by **drawing on a real candlestick chart**; the instructor gets a class report.

Think "Google Forms, but for chart reading" with a drawing-enabled chart and automatic grading.

## Why it exists
Institutes today test students with Google Forms, Telegram polls or slides. It is manual, unreliable, and they cannot prove students are improving.
Our buyer is the **institute owner / instructor**. The end user is their **students**.

## Current scope
A real, usable product that also has to impress in a 5-minute demo. The full plan is in `docs/plan.md`, and the
stack, grading rules and trade-offs are in `docs/decisions.md`. Read those before changing behaviour.

- Roles: admin, master, student. Real login, with data scoped by `organizationId`.
- All UI text is Persian, RTL, Vazirmatn, Persian digits, Jalali dates. Strings live in `src/lib/i18n.ts`.
- Light theme only, one accent color. The chart itself stays LTR.

### Not in scope
Cash prizes, gambling-like mechanics, payments between users, public marketplace, AI chat, native mobile apps.
Do not add these unless I ask.

## Rules that must not break
- Grading is server-side only. Students get question data only through `src/server/dto.ts`.
- The correct answer and hidden candles never reach a student before `canReview` allows it. Never accept a score from the client.
- Every service takes an `actor` and checks ownership. Another institute's resource returns 404.
- Questions should be objective, with an outcome measurable from the candle data.
- Schema changes go through Prisma migrations. Node 22 is required.

## Existing prior work (reference only)
Older prototype repos under github.com/tradingquizco: `backend` (Express + Sequelize + MySQL), `user`, `quizer`, `main` (Next.js). We are NOT reusing them directly. Known problems there: client-sent `isCurrect`, answers exposed in API, no ownership checks, open CORS, `sync({alter:true})`. Do not repeat those.

## Working style
- Build incrementally and run the app after each step. Show me what changed.
- Keep the code simple; no premature abstractions.
- Ask before adding paid services or dependencies that cost money.
- Commit in small steps with clear messages.
- See `docs/` for the plan, decisions and validation plan. `docs/mvp-scope.md` and `docs/roadmap.md` describe the older demo scope.
