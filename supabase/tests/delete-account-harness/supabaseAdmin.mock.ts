import { execFileSync } from "node:child_process";
const q = (sql: string) => execFileSync("psql", ["-d", "ap_del_test", "-Atc", sql]).toString().trim();
const users: Record<string, string> = JSON.parse(process.env.TOKENS!);
export const supabaseAdmin: any = {
  auth: {
    getUser: async (t: string) => {
      const id = users[t];
      if (!id) return { data: { user: null }, error: { status: 401, message: "invalid JWT" } };
      if (q(`select 1 from auth.users where id='${id}'`) !== "1") return { data: { user: null }, error: { status: 403, code: "user_not_found", message: "User from sub claim in JWT does not exist" } };
      return { data: { user: { id } }, error: null };
    },
    admin: { deleteUser: async (id: string) => { q(`delete from auth.users where id='${id}'`); return { error: null }; } },
  },
  rpc: async (fn: string, args: any) => ({ data: JSON.parse(q(`select public.${fn}('${args.p_user_id}')`)), error: null }),
};
