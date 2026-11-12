/** @type {import('next').NextConfig} */
const e = process.env;

// Vercel's Supabase integration saves keys as STORAGE_SUPABASE_*; accept those too.
// The URL and anon/publishable key are public by design (row-level security protects the data).
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: e.NEXT_PUBLIC_SUPABASE_URL || e.STORAGE_NEXT_PUBLIC_SUPABASE_URL || e.STORAGE_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      e.NEXT_PUBLIC_SUPABASE_ANON_KEY || e.STORAGE_NEXT_PUBLIC_SUPABASE_ANON_KEY || e.STORAGE_SUPABASE_ANON_KEY || e.STORAGE_SUPABASE_PUBLISHABLE_KEY || "",
  },
};
export default nextConfig;
