# Deployment checklist

Target: Vercel in Washington, D.C. (`iad1`, set in `vercel.json`) and Neon in AWS Virginia (`aws-us-east-1`), so the
two stay close. Both free tiers are enough for a demo. Neither account needs a card for this.

Binance restricts some regions, and `iad1` is in the US, so fetching candles may be refused there. The question
editor then says so and CSV upload still works. Exams are unaffected, because candles are stored with each question.

Migrations are deliberately not part of the build, so a failed deploy cannot leave the schema half changed.

## 1. Database (Neon)

1. Create a project in `aws-us-east-1`.
2. Copy both connection strings: the pooled one (host contains `-pooler`) and the direct one.

## 2. Schema and first data

Run from your machine with Node 22. Never commit these values.

```bash
export DATABASE_URL="<pooled url>"
```

```bash
export DIRECT_URL="<direct url>"
```

```bash
npm run db:deploy
```

Then pick one. Any database that isn't local counts as production here: a password of at least 12 characters is
required and `SEED_RESET` is refused.

For a demo, with the sample institute, master, students and results:

```bash
SEED_PASSWORD="<strong password>" npm run db:seed
```

For real use, with only an admin who then creates institutes:

```bash
ADMIN_USERNAME="<username>" ADMIN_PASSWORD="<strong password>" npm run db:create-admin
```

## 3. App (Vercel)

Import the Git repository in the Vercel dashboard, or run `vercel link` here. Set these for Production:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Pooled Neon URL |
| `DIRECT_URL` | Direct Neon URL |
| `APP_URL` | Public site URL with no trailing slash, used in invite links |

`SEED_PASSWORD` does not belong on Vercel. Node comes from `engines` in `package.json`.

## 4. After the first deploy

- [ ] `/` loads, and `/login` signs in over HTTPS
- [ ] Log in as a student, take the open exam, and confirm the reveal
- [ ] An invite link starts with `APP_URL`
- [ ] Question editor: fetch candles from Binance. A blocked-location message means CSV is the way to load data from this region
- [ ] Open the site on a phone and draw a line with a finger
- [ ] Open the site from an institute's real network, without a VPN, before any pilot

## Later schema changes

Run `npm run db:deploy` against the direct URL before deploying code that needs the new schema.
