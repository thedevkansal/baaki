# Baaki

**बाकी** — _what's remaining, what's outstanding._

_kitna baaki hai?_ Split any bill, any way, with anyone. Settle up in one tap. Every feature free.

---

## Why

Splitwise moved nearly everything useful behind Pro. Their own [pricing page](https://www.splitwise.com/pro) lists unlimited expenses, currency conversion, charts, receipt scanning, itemisation, expense search, default split settings and an ad-free experience as paid features. The free tier caps how many expenses you can add in a day, shows video ads inside an app where people track real money, and cannot search its own history.

Baaki charges for none of that. It also does the two things their own [feedback board](https://feedback.splitwise.com/forums/162446-general/filters/top) has asked for for years:

- **Settle over UPI without leaving the app.** Payee, exact amount and note arrive prefilled. (458 votes, unbuilt.)
- **Explain a simplified debt.** Tap "you owe Rahul ₹340" and see the original bills it replaced, instead of mysteriously owing money to someone you never spent anything with.

## Principles

**Money is never a float.** Every amount is an exact integer count of minor units, carried as `bigint`. Splits use largest-remainder allocation with a rotating tiebreak, so parts always sum back to the total and the same person doesn't absorb the odd paisa every time. Enforced by property tests, and again by a deferred trigger in Postgres, so nothing reaching the database by any route can leave an expense unbalanced.

**We don't claim to verify what we can't.** A `upi://pay` link returns nothing to the page that opened it; knowing the money moved would mean becoming a payment merchant. So settling is two-sided: the payer says they paid, the payee confirms, and only then do balances move. No mocked confirmation, no fake "verified" badge.

**Nothing frame-dependent owns the truth.** Animated figures are rendered by React and only decorated by animation, with a timer guaranteeing the exact value. A page that stops being drawn shows a still balance, never a wrong one.

**Six colours, no seventh.** A balance is a signed number, so the interface is the axis it lives on: teal when you're owed, plum when you owe, ink on paper for everything else.

## What works

Storage is currently the browser: one device, no account, no sync. The Postgres layer underneath is built and tested but not yet wired to the UI, because that needs accounts first.

| | |
|---|---|
| Groups | Create, rename, delete. Add people **by name alone** — no email, no phone, no invite to accept |
| Bills | Calculator in the amount field (`450+120*2`), categories, dates, several payers on one bill |
| Splits | Equally, exact amounts, percentages, shares, plus-or-minus |
| Currency | Any supported currency per bill; the rate is saved with it and never re-applied |
| Settling | UPI deep link by device, QR on desktop, two-sided confirmation |
| Charts | Where the money went, who has been carrying it |
| Search | Across descriptions, categories and who paid |
| Export | CSV with a column per person |

## Running it

```bash
npm install
npm run dev
```

Nothing needs configuring to run it. For the database layer:

```bash
cp .env.example .env.local   # fill in DATABASE_URL
npm run db:migrate
```

```bash
npm test          # unit, property and database tests
npm run typecheck
npm run lint
```

The database tests need no container and no credentials: PGlite is Postgres compiled to WASM and runs in the test process, so the schema, its triggers and its constraints are exercised for real.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Drizzle + Postgres · deployed on Vercel. All of it runs on free tiers, and none of it needs Docker.
