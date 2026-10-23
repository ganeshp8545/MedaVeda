import { supabase } from "../config/supabase";

// Always read the existing app_settings flag; no persistent cache to hide an
// administrator's change. Errors preserve the last confirmed value in this
// process; fail open only before any valid boolean has been received.
let lastConfirmed: boolean | undefined;

export async function checkMaintenanceMode(): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      (async () => {
        const { data, error } = await supabase.rpc("get_maintenance_mode")
          .abortSignal(controller.signal);
        return !error && typeof data === "boolean" ? data : null;
      })(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => { resolve(null); controller.abort(); }, 6000);
      }),
    ]);
    if (result !== null) lastConfirmed = result;
    return lastConfirmed ?? false;
  } catch {
    return lastConfirmed ?? false;
  } finally {
    clearTimeout(timer);
  }
}
