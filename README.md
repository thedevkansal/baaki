# Baaki

**बाकी** — _what's remaining, what's outstanding._

Split any bill, any way, with anyone. Settle up in one tap. Every feature free.

---

## Why

Splitwise moved nearly everything useful behind Pro. Their own [pricing page](https://www.splitwise.com/pro) lists unlimited expenses, currency conversion, charts, receipt scanning, itemisation, expense search, default split settings and an ad-free experience as paid features. The free tier caps how many expenses you can add in a day, shows video ads inside an app where people track real money, and cannot search its own history.

Baaki charges for none of that. It also does the two things their own [feedback board](https://feedback.splitwise.com/forums/162446-general/filters/top) has been asking for for years:

- **Settle over UPI without leaving the app.** Payee, exact amount and note arrive prefilled. (458 votes, unbuilt.)
- **Explain a simplified debt.** Tap "you owe Rahul ₹340" and see the original expenses it stands in for — instead of mysteriously owing money to someone you never spent anything with.

## Principles

**Money is never a float.** Every amount in this codebase is an exact integer count of minor units — paise, cents — carried as `bigint`. Splits use largest-remainder allocation with a rotating tiebreak, so the parts always sum back to the total and the same person doesn't absorb the odd paisa on every bill. This is enforced by property tests, not by care.

**We don't claim to verify what we can't.** A `upi://pay` deep link returns nothing to the page that opened it; knowing the money moved would require onboarding as a payment merchant. So settlements are two-sided: the payer says they paid, the payee confirms, and only then do balances move. No mocked confirmation, no fake "verified" badge.

**Six colours, no seventh.** A balance is a signed number, so the interface is the axis it lives on: teal when you're owed, plum when you owe, ink on paper for everything else.

## Status

Early. The ledger core, design system and UPI link builder are done and tested; persistence, auth and the app shell are not.

|                        |                                                          |
| ---------------------- | -------------------------------------------------------- |
| `src/lib/money.ts`     | Exact integer money, allocation, parsing, formatting     |
| `src/lib/ledger/`      | Net balances, pairwise debts, explainable simplification |
| `src/lib/upi/`         | Deep links, per-platform routing, VPA validation         |
| `src/components/beam/` | The balance beam                                         |
| `/specimen`            | Live reference for the whole design system               |

## Running it

```bash
npm install
cp .env.example .env.local   # fill in Supabase, Upstash
npm run dev
```

```bash
npm test          # unit + property tests
npm run typecheck
npm run lint
```

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Motion · Drizzle + Postgres (Supabase) · Upstash Redis · deployed on Vercel. All of it runs on free tiers, and none of it needs Docker.
