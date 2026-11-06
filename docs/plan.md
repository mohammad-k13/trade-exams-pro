# TradingQuiz Pro: Phase A plan

Status: agreed scope for the full product build. Supersedes `docs/mvp-scope.md` and the demo-only
scope in the original `CLAUDE.md` (no auth, dark theme, English first).

## 1. Product requirements (summary)

An institute's master builds objective, chart-based exams. Students take them in a server-timed window.
The master gets trustworthy grades and a plain-Persian view of the class's weak spots.

Success test: in 5 minutes a credible trader sees a question being built from real candles, a student
drawing on the chart, a reveal with evidence for the grade, and an insight list about the class.

What makes an instructor trust the grading (these drive the design):

- The answer is derived from data wherever possible. Direction answers are computed from the hidden
  candles, and the master cannot mistype them.
- Grades carry evidence: "your line was 0.4% from the level; tolerance 0.5%", drawn on the chart.
- The rule is visible before the exam, and the editor shows the tolerance band while authoring.
- Questions are frozen when an exam is published, so a later edit cannot change a running exam.
- Item analysis flags suspect questions (strong students failing, weak students passing).

## 2. Roles and permissions

| Capability | Admin | Master | Student |
|---|---|---|---|
| Institutes and masters, demo requests | all | - | - |
| Students, groups, questions, exams, results, audit log | read-only overview | own org only | - |
| See and take assigned exams | - | - | assigned only |
| See own review | - | - | when the exam policy allows |

Enforcement is in server services, not in layouts. Every service takes an `actor` and scopes by
`organizationId`. Another institute's resource returns 404, not 403, so ids cannot be probed.

## 3. Data model (Prisma, PostgreSQL)

`Organization`, `User` (role, org, `mustChangePassword`, `isActive`, `deletedAt`), `Session` (stores only
a hash of the token), `InviteToken`, `RateLimit`, `Group`, `GroupMember`, `Topic`, `Question`
(`visibleCandles`, `futureCandles`, `options`, `answerKey`, `allowedTools`, `anonymize`), `QuestionTopic`,
`Exam` (`status`, window, duration, `maxAttempts`, shuffles, `reviewPolicy`, `reviewAt`, `closedAt`),
`ExamQuestion` (`position`, `points`, frozen `snapshot`), `ExamStudent`, `ExamGroup`,
`Attempt` (`startedAt`, `deadlineAt`, `submittedAt`, status, score, per-attempt order),
`Answer` (`response`, `flagged`, `timeSpentMs`, `isCorrect`, `points`, `gradingDetail`),
`AuditLog`, `DemoRequest`.

Times are `timestamptz` in UTC. Display is Jalali, Asia/Tehran.
Displayed exam status is derived: draft, scheduled, active or closed, from `status`, the window and `closedAt`.

## 4. Page map

- Public: `/` (landing and demo request), `/login`, `/invite/[token]`, `/change-password`
- Admin: `/admin`
- Master: `/master` (overview and onboarding checklist), `/master/students`, `/master/students/[id]`,
  `/master/groups`, `/master/questions` plus editor, `/master/exams` plus builder,
  `/master/exams/[id]/results` plus per-student and CSV export, `/master/analytics`, `/master/audit`
- Student: `/student`, `/student/exams/[id]` (instructions), `/student/attempts/[id]` (taking),
  `/student/attempts/[id]/result` (review, printable)

## 5. Grading rules

All binary per question, weighted by `points`. Unanswered is incorrect. Implemented as pure functions.

| Type | Correct when |
|---|---|
| Multiple choice | chosen option id equals the key |
| Direction | `change = (close[last visible + N] - close[last visible]) / close[last visible]`. Up if `change > S%`, down if `change < -S%`, otherwise sideways. `N` and `S` are set per question. |
| Draw level | `abs(price - level) / level <= T%`, using the student's horizontal line |
| Draw trend line | student's line passes within `T%` of at least `K` of the master's pivots, checked at each pivot's candle. Rays and segments only count inside their extent. Pivots are swing points near the master's reference line, found automatically and shown to the master. |

Points in a drawing are graded by candle index, not time, so anonymised charts grade correctly.
`T%` is suggested from ATR (a flat 1% is reasonable for BTC and absurd for EUR/USD).
Fibonacci and other helper tools can be allowed on any question but are never graded.

## 6. Risks and how each is handled

1. **Students look up the real chart.** A visible symbol and date let a student open TradingView and read
   the "future". Questions are anonymised by default (symbol and dates hidden, timestamps replaced) until review.
2. **Answers leaked by early finishers.** "Review after submit" lets the first finisher share answers.
   The default policy is after the exam closes. With attempts left, review stays locked.
3. **Serverless cannot auto-submit at a timer.** Expired attempts are finalised lazily on the next read or
   write by anyone, including the master's results page. The result is identical, with no cron dependency.
4. **Binance blocks some regions.** The call runs on the server, uses the market-data host
   `data-api.binance.vision`, and candles are copied into the question. Exams never depend on Binance.
   CSV upload is the fallback. Must be retested from the deployed Vercel region.
5. **Iran access.** Vercel and Neon are US services and may be filtered or restricted for Iranian users, and
   Google Fonts may be unreachable. Fonts are self-hosted and the app is plain Node + Postgres so it can move
   to any host. **Test from the institutes' real networks before a paid pilot.**
6. **Data in responses.** RSC payloads serialise everything passed to client components. Client data only
   comes through explicit allow-list DTOs, covered by sentinel-based leak tests.
7. **Client-reported time per question** is untrusted. It is used only for analytics, clamped, and never for grading.
8. **Small classes** make item statistics noisy. Suspect-question flags need a minimum sample and are worded as prompts to check.
9. **CSV injection** in exports. Cells beginning with `= + - @` are neutralised.
10. **Scope.** This is a large build; admin stays deliberately small.

## 7. Requirement conflicts and the choice made

| Conflict | Choice |
|---|---|
| `CLAUDE.md` said no auth, dark, English first; the new brief says the opposite | The new brief wins. `CLAUDE.md` updated. |
| "Reveal after submit/close" vs "when the master allows" with several attempts | Strictest wins: finished, policy allows, and no attempts left or the exam is closed. |
| "No English in the UI" vs ticker symbols such as BTCUSDT | Tickers stay Latin, as traders expect. Everything else is Persian. |
| "Persian digits" vs CSV exports | UI is Persian digits. CSV numbers stay Latin so Excel can calculate; headers are Persian. |
| README says "interviews before code" | Noted. You asked to build now, so building. |

## 8. Build order

1. Foundation: deps, Postgres, schema, i18n, Jalali, font, UI kit
2. Auth, sessions, rate limits, change password, invites
3. Grading engine with tests
4. Students, groups, CSV import
5. Chart component, question bank and editor, Binance and CSV
6. Exam builder and publish snapshot
7. Student dashboard, attempt engine, autosave, timer, review
8. Results, CSV export, analytics, insights
9. Admin, landing, onboarding, audit log, seed
10. Remaining tests, READMEs, `docs/decisions.md`, end-to-end check, final report
