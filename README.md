# Baaki

**बाकी** _(baaki)_: what's remaining, what's outstanding.

_kitna baaki hai?_ Split any bill, any way, with anyone. Settle up in one tap. Every feature free.

**[baaki.live](https://baaki.live)**

---

## Why

Splitwise puts unlimited expenses, currency conversion, charts, receipt scanning, itemisation and search behind [Pro](https://www.splitwise.com/pro), caps how many bills you can add in a day, and runs video ads in an app where people track real money.

Baaki charges for none of it, and does the two things their own [feedback board](https://feedback.splitwise.com/forums/162446-general/filters/top) has asked for for years:

- **Settle over UPI without leaving the app.** Payee, amount and note arrive prefilled. Verified on a real Android phone. (458 votes, unbuilt there.)
- **Explain a simplified debt.** Tap "you owe Rahul ₹340" and see the bills it replaced, instead of owing money to someone you never spent anything with.

## Principles

**Money is never a float.** Exact integer minor units as `bigint`, largest-remainder splits with a rotating tiebreak. Enforced by property tests and again by a deferred Postgres trigger, so no route into the database can leave a bill unbalanced.

**We don't claim to verify what we can't.** A `upi://pay` link tells the page nothing. Knowing the money moved would mean becoming a payment merchant. So settling is two-sided: payer says paid, payee confirms, balances move then. No fake "verified" badge.

**The server decides who is asking.** A browser can claim to be anyone, so it isn't asked. You rename yourself and set your own UPI ID; only an admin removes a member.

**A UPI ID is encrypted and authenticated at rest.** One altered character pays a stranger, and Baaki cannot see payments, so nothing would notice. AES-256-GCM fails to decrypt rather than yielding a different valid-looking VPA.

**Six colours, no seventh.** A balance is a signed number, so the interface is that axis: teal owed to you, plum owed by you, ink on paper for the rest.

## What works

Local first. Groups live in the browser with no account and no network. Sharing syncs to Postgres so others can join by link, typing their own name and UPI ID. Google sign in is optional and attaches the seats this browser already holds to a person, so a cleared cache isn't the end of your data.

Bills take several payers, a calculator in the amount field (`450+120*2`), any currency at the rate saved with it, and split equally, by exact amounts, percentages, shares or plus-or-minus. Plus charts, search, history with undo, CSV export, Splitwise import, recurring bills, and installable to the home screen.

Not built: receipt scanning, personal expenses, custom categories, web push.

## Running it

```bash
npm install
npm run dev
```

Runs against browser storage with nothing configured. For sync and accounts, fill `.env.local` from `.env.example` and `npm run db:migrate`.

Supabase wants two connection strings. Runtime uses the transaction pooler (6543); migrations need the session pooler (5432), because DDL, advisory locks and the deferred trigger all need one backend to stay put. New projects have no IPv4 direct host, so `db.<ref>.supabase.co` will not resolve.

`PAYMENT_ID_ENCRYPTION_KEY` (32 bytes of base64) seals UPI IDs. Unset, they simply aren't stored: a group loses one-tap settling, never its money.

```bash
npm test          # unit, property and database tests
npm run typecheck
npm run lint
```

Database tests need no container and no credentials. PGlite is Postgres compiled to WASM, running in the test process, so the schema and its triggers are exercised for real.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Drizzle + Postgres · Supabase Auth · Vercel. Free tiers throughout, no Docker.
