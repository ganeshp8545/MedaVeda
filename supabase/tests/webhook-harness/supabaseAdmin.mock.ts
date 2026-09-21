import { execFileSync } from "node:child_process";
const db = process.env.WH_DB ?? "ap_wh";
const lit = (v: unknown) => (v === null || v === undefined ? "null" : typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
// Only rpc() is needed by settle.ts's dispute / refund paths; it calls the REAL database function.
export const supabaseAdmin: any = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    const named = Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ");
    try {
      const out = execFileSync("psql", ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-w", "-d", db, "-Atc", `select public.${fn}(${named})::text`]).toString().trim();
      return { data: out ? JSON.parse(out) : null, error: null };
    } catch (e: any) {
      return { data: null, error: { code: "PSQL", message: String(e.stderr ?? e.message) } };
    }
  },
};
export const getUserFromAuthHeader = async () => null;
