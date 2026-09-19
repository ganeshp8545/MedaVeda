// Ambient types for the Supabase Edge Functions in supabase/functions/.
//
// These files run on Deno at deploy time (Supabase's own build step
// handles that - it has real Deno types built in, this file has zero
// effect there). This .d.ts exists purely so VS Code's TypeScript
// server - which is checking these files using the mobile app's
// Node/React-Native project - stops flagging `Deno` as an unknown
// global and `https://...` imports as unresolvable modules. It's an
// editor-only convenience file, never bundled or deployed anywhere.

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module "https://*";