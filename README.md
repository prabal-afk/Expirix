# Expirix

Track Expiry. Reduce Waste. Sell Fresh.

Expiry-date and stock tracking for small shops. Built with Next.js, TypeScript, Tailwind CSS and Supabase.

## Install and run

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and choose **Try the demo shop**. No setup is needed: demo data is stored in your browser.

## Other commands

```bash
npm test          # run unit tests
npm run build     # production build
npm start         # serve the production build
```

## Optional: cloud database

Copy `.env.example` to `.env.local` and fill in the Supabase values. Without them the app runs in demo mode.
The database schema is in `supabase/schema.sql`.
