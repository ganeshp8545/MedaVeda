import { packageName, serviceAccountToken } from "../_shared/googlePlay.ts";
import {
  aalFromAuthHeader,
  getUserFromAuthHeader,
  supabaseAdmin,
} from "../_shared/supabaseAdmin.ts";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
  getUser: getUserFromAuthHeader,
  getAdmin: async (id) => {
    const { data, error } = await supabaseAdmin.from("admins")
      .select("id").eq("id", id).maybeSingle();
    if (error) throw new Error("Admin lookup failed");
    return !!data;
  },
  getAal: aalFromAuthHeader,
  getToken: serviceAccountToken,
  getPackageName: packageName,
  fetchGoogle: fetch,
}));
