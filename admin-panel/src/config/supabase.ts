import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Add them to a .env file (see .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DEBUG ONLY - lets you run supabase.rpc(...)/supabase.from(...) straight
// from the browser console while developing (e.g. localhost:5173). Never
// runs in a production build since import.meta.env.DEV is false there.
if (import.meta.env.DEV) {
  (window as any).supabase = supabase;
}
