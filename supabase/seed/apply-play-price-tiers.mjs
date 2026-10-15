// Fill play_price_tiers.json from a reviewed live price inventory. This script
// validates and inserts INACTIVE tiers only. Activation is a separate Play
// Console verification step. Usage: node apply-play-price-tiers.mjs [--apply]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const path = fileURLToPath(new URL("./play_price_tiers.json", import.meta.url));
let payload;
try { payload = JSON.parse(readFileSync(path, "utf8")); }
catch { throw new Error("play_price_tiers.json is not valid JSON"); }
if (!payload || !Array.isArray(payload.tiers)) throw new Error("Expected {tiers: [...]}");
if (payload.tiers.length === 0) {
  console.log("No price tiers configured. Query live active product prices first; nothing to upsert.");
  process.exit(0);
}
const seenPrices = new Set();
const seenSkus = new Set();
for (const tier of payload.tiers) {
  if (!tier || typeof tier !== "object" || Object.keys(tier).sort().join(",") !== "priceInr,sku")
    throw new Error("Each tier must contain only priceInr and sku");
  if (!Number.isSafeInteger(tier.priceInr) || tier.priceInr < 1 || tier.priceInr > 99999999)
    throw new Error("priceInr must be a positive whole INR amount within numeric(10,2)");
  if (tier.sku !== `notes_${tier.priceInr}`) throw new Error(`SKU must equal notes_${tier.priceInr}`);
  if (seenPrices.has(tier.priceInr) || seenSkus.has(tier.sku)) throw new Error("Duplicate tier price or SKU");
  seenPrices.add(tier.priceInr); seenSkus.add(tier.sku);
}
const rows = payload.tiers.map((tier) => `(${tier.priceInr},'${tier.sku}',false)`).join(",\n  ");
const sql = `begin;\ninsert into public.play_price_tiers(price_inr,play_sku,active) values\n  ${rows}\non conflict(price_inr) do update set play_sku=excluded.play_sku\n  where not public.play_price_tiers.active;\ncommit;\n`;
if (!process.argv.includes("--apply")) {
  console.log(`Validated ${payload.tiers.length} tier(s). Dry run: all will remain inactive. Use --apply with DATABASE_URL to upsert.`);
  console.log(sql);
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for --apply");
execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-d", process.env.DATABASE_URL], {
  input: sql, stdio: ["pipe", "inherit", "inherit"],
});
console.log(`Upserted ${payload.tiers.length} inactive tier(s). Verify each Play Console price before activating.`);
