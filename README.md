# کوییز ترید (TradingQuiz Pro)

[English below](#english)

سامانه‌ی سنجش مهارت چارت‌خوانی برای موسسه‌های آموزش ترید. استاد آزمون چارت‌محور می‌سازد، دانشجو روی چارت واقعی پاسخ می‌دهد، نمره در سرور محاسبه می‌شود و استاد نقاط ضعف کلاس را می‌بیند.

## اجرا روی سیستم خودتان

پیش‌نیازها: Node.js نسخه‌ی ۲۲ (نسخه‌ی ۲۳ با Prisma کار نمی‌کند) و PostgreSQL. اگر Docker دارید، پایگاه داده با `docker compose up -d` بالا می‌آید.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run db:deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

برنامه روی `http://localhost:3000` اجرا می‌شود.

### حساب‌های نمونه

رمز همه‌ی حساب‌ها `demo-password-1` است، مگر اینکه `SEED_PASSWORD` را تنظیم کرده باشید.

| نقش | نام کاربری |
|---|---|
| مدیر سیستم | `admin` |
| استاد | `master` |
| دانشجو | `student01` تا `student10` |

`student01` و `student02` هنوز در «آزمون جامع این هفته» شرکت نکرده‌اند و بعد از ثبت، بلافاصله نتیجه و ادامه‌ی چارت را می‌بینند. برای دمو از این دو حساب استفاده کنید.

برای پاک‌کردن همه‌چیز و ساخت دوباره‌ی داده‌ی نمونه، این دستور را اجرا کنید. در محیط production کار نمی‌کند:

```bash
SEED_RESET=1 npm run db:seed
```

## متغیرهای محیطی

| متغیر | کاربرد |
|---|---|
| `DATABASE_URL` | اتصال برنامه به پایگاه داده (در Neon، آدرس pooled) |
| `DIRECT_URL` | اتصال مستقیم برای migration |
| `APP_URL` | آدرس عمومی سایت، برای لینک‌های دعوت |
| `SEED_PASSWORD` | رمز حساب‌های نمونه؛ در production الزامی است |

## تست

تست‌ها از یک پایگاه داده‌ی جدا با پسوند `_test` استفاده می‌کنند که باید از قبل ساخته شده باشد.

```bash
npm test
```

## انتشار روی Vercel

1. در [Neon](https://neon.tech) یک پایگاه داده‌ی رایگان بسازید و هر دو آدرس pooled و direct را بردارید.
2. پروژه را در Vercel وارد کنید، متغیرهای بالا را تنظیم کنید و منطقه‌ی Functions را نزدیک پایگاه داده بگذارید.
3. migrationها را از سیستم خودتان اجرا کنید. این کار عمداً بخشی از build نیست:

```bash
DIRECT_URL="آدرس-direct" npm run db:deploy
```

4. برای ساخت مدیر سیستم، seed را یک بار با `SEED_PASSWORD` قوی اجرا کنید. این کار داده‌ی نمونه هم می‌سازد.

**پیش از پایلوت:** دسترسی را از شبکه‌ی واقعی موسسه‌ها بررسی کنید. Vercel و Neon شرکت‌های آمریکایی هستند و ممکن است از ایران در دسترس یا مجاز نباشند. برنامه فقط به Node و PostgreSQL نیاز دارد و روی هر سرور دیگری هم اجرا می‌شود. بایننس هم ممکن است درخواست‌ها را بر اساس موقعیت سرور رد کند؛ در این صورت ویرایشگر سؤال پیام می‌دهد و می‌توانید از CSV استفاده کنید.

مستندات بیشتر: [تصمیم‌ها و قواعد نمره‌دهی](docs/decisions.md) (به انگلیسی)

---

<a id="english"></a>

# TradingQuiz Pro

A chart-reading assessment platform for trading education institutes. Masters build chart-based exams, students answer on a real candlestick chart, the server grades them, and the master sees where the class is weak. The UI is in Persian with Jalali dates.

## Run locally

Requires Node.js 22 (Prisma refuses Node 23) and PostgreSQL. With Docker, `docker compose up -d` starts a database.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run db:deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open `http://localhost:3000`.

### Demo accounts

Every password is `demo-password-1` unless you set `SEED_PASSWORD`.

| Role | Username |
|---|---|
| Admin | `admin` |
| Master | `master` |
| Student | `student01` to `student10` |

`student01` and `student02` have not taken the open exam, and its review opens right after submitting, so use them to show the reveal in a demo.

To wipe everything and reseed (refused in production):

```bash
SEED_RESET=1 npm run db:seed
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | App connection (Neon: the pooled URL) |
| `DIRECT_URL` | Direct connection for migrations |
| `APP_URL` | Public site URL, used in invite links |
| `SEED_PASSWORD` | Password for seeded accounts; required in production |

## Tests

Tests use a separate database named after yours with a `_test` suffix, which must already exist. Set `TEST_DATABASE_URL` to use another.

```bash
npm test
```

## Deploy to Vercel

1. Create a free [Neon](https://neon.tech) database and copy both the pooled and direct URLs.
2. Import the project into Vercel, set the variables above, and pick a Functions region near the database.
3. Run migrations from your machine. They are deliberately not part of the build:

```bash
DIRECT_URL="your-direct-url" npm run db:deploy
```

4. Seed once with a strong `SEED_PASSWORD` to create the admin account. This also creates the demo institute.

**Before a pilot:** test access from the institutes' real networks. Vercel and Neon are US services and may be unreachable or not permitted from Iran. The app only needs Node and PostgreSQL, so it can run on any host. Binance may also refuse requests based on the server's location; the question editor then says so and CSV upload still works.

More detail: [decisions and grading rules](docs/decisions.md).
