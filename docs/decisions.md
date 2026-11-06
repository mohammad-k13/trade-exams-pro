# Decisions

## Stack

| Choice | Why | Rejected |
|---|---|---|
| Next.js 16 App Router, TypeScript, Tailwind 4 | One app for pages and server code, and easy to deploy | Separate front and back ends: more to run, no benefit here |
| PostgreSQL with Prisma 7 migrations | Real JSON and arrays, free tiers, no `sync` in production | SQLite: behaves differently from production and does not persist on Vercel |
| `@prisma/adapter-pg` everywhere | The same code runs on local Postgres and Neon's pooler | `@prisma/adapter-neon`: a second code path with no need for edge runtime |
| klinecharts | Open source, with drawing overlays built in | |
| Own small UI kit, native `select` and `dialog` | Few dependencies, better on phones | shadcn/ui: adds Radix for little gain in a form-heavy RTL app |
| `Intl` plus `jalaali-js` | Formatting needs no library; a small picker is enough | Date picker libraries |
| Own sessions, argon2id | Username and password only; a small, testable surface | Auth.js: built around providers that are not needed here |
| Rate limits in Postgres | Shared across serverless instances, free | Redis: another service |
| Self-hosted Vazirmatn | Works where Google Fonts is unreachable | `next/font/google` |

Node 22 is required: Prisma 7 refuses Node 23.

## Grading rules

Every question is right or wrong and worth its `points`. Unanswered is incorrect. The code is in
`src/lib/grading/index.ts`, with no I/O, so tests run exactly what production runs.

**Multiple choice.** The chosen option id must equal the key.

**Direction.** Computed from the hidden candles, so the master cannot mistype it.
`change = (close at horizon N - last visible close) / last visible close`.
Up if `change > S%`, down if `change < -S%`, otherwise sideways. A move exactly at the threshold is sideways.
If N runs past the data, the last candle is used.

**Draw a level.** `|price - level| / level <= T%`. The last horizontal line drawn is the answer.

**Draw a trend line.** The line must pass within `T%` of at least `K` of the master's pivots, measured at each
pivot's candle. A ray or segment only counts inside its extent. Pivots are swing points (the extreme of 3 candles
on each side) that the master's reference line passes within `T%` of. They are computed when the question is saved
and shown to the master. Pivots are fixed in advance because any two swing points define some line, so "touches
any two pivots" would be meaningless.

**Helper tools** such as Fibonacci can be allowed on any question and are never graded.

**Tolerance.** The editor suggests half of ATR(14) as a percent of the last close. A flat percentage would be far
too loose on forex and too tight on volatile crypto.

**Indexes, not timestamps.** Drawn points are stored by candle index, so grading does not depend on the fake
timestamps of anonymised charts.

## Integrity

- **Only one path to students.** `src/server/dto.ts` copies each field explicitly. A new secret column cannot reach a
  browser by accident. `tests/leak.test.ts` checks this with sentinel values.
- **Anonymised by default.** Otherwise a student can open the same symbol and date elsewhere and read the "future".
  Prices stay real, so someone determined could still search by price. It raises the effort but is not a guarantee.
- **Snapshot at publish.** Editing the bank cannot change a running exam or its grades.
- **Review gate** (`canReview`): needs a finished attempt and the policy, plus no attempts left unless the exam has
  closed. The default policy is after close, because earlier review lets early finishers share answers.
- **Score without review.** With review disabled, the score alone still appears after close, since it reveals no answers.

## Time

The server stores `deadlineAt = min(startedAt + duration, exam end)`. The client only displays a countdown.

Serverless has no timers, so overdue attempts are finalised on the next read or write by anyone: the student,
their dashboard, or the master's results and analytics. Grades are identical; an abandoned attempt just stays
`IN_PROGRESS` in the database until someone looks. Finalising claims the row with a conditional update, so racing
calls grade once.

Saves are accepted for 5 seconds after the deadline to cover network latency. Time per question is reported by the
client, so it is used only for analytics.

## Reporting

- **Reported grade:** the student's best finished attempt.
- **Class analytics:** the first finished attempt per exam, because retakes overstate what the class knew.
- **Suspect question flag:** upper-lower discrimination below zero, with at least 8 answers. It is worded as a prompt
  to check the question, because small classes are noisy.
- **Trend** compares exams that may cover different topics, so a change can reflect difficulty rather than learning.

## Known trade-offs

- Dates use a fixed UTC+03:30, since Iran dropped daylight saving in 2022. Fine unless the law changes again.
- Results and analytics load everything for an institute on each request, which suits classes of hundreds, not many thousands.
- Candle data is not in the seed from Binance: Binance returned HTTP 451 from the development machine, so seed
  fixtures are real public candles from Kraken. Check the data terms before relying on them commercially.
