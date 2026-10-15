import { execFileSync } from "node:child_process";
const db = process.env.WH_DB ?? "ap_wh";
const lit = (v: unknown) => (v === null || v === undefined ? "null" : typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const execute = (sql: string) => execFileSync("psql", ["-h", process.env.PGHOST ?? "127.0.0.1", "-p", process.env.PGPORT ?? "54329", "-U", process.env.PGUSER ?? "postgres", "-w", "-d", db, "-Atc", sql]).toString().trim();
export const supabaseAdmin: any = {
  from: (table: string) => {
    if (!["orders","provider_events","payment_captures"].includes(table)) throw new Error("Unexpected mock table");
    const filters: string[] = [];
    let columns = "*";
    let changes: Record<string,unknown> | null = null;
    const query: any = {
      select: (value: string) => { columns = value; return query; },
      update: (value: Record<string,unknown>) => { changes = value; return query; },
      eq: (column: string,value: unknown) => { filters.push(`${column}=${lit(value)}`); return query; },
      maybeSingle: async () => {
        const sql = `select row_to_json(o) from (select ${columns} from public.${table} ${filters.length?`where ${filters.join(' and ')}`:''} limit 1) o`;
        const out = execute(sql);
        return { data: out ? JSON.parse(out) : null, error: null };
      },
      then: (resolve: (value: unknown)=>void) => {
        if (changes) execute(`update public.${table} set ${Object.entries(changes).map(([k,v])=>`${k}=${lit(v)}`).join(',')} ${filters.length?`where ${filters.join(' and ')}`:''}`);
        resolve({ data: null, error: null });
      },
    };
    return query;
  },
  rpc: async (fn: string, args: Record<string, unknown>) => {
    const named = Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ");
    try {
      const out = execute(`select public.${fn}(${named})::text`);
      return { data: out ? JSON.parse(out) : null, error: null };
    } catch (e: any) {
      return { data: null, error: { code: "PSQL", message: String(e.stderr ?? e.message) } };
    }
  },
};
export const getUserFromAuthHeader = async () => null;
