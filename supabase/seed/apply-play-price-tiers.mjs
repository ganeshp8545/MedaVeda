// Retired after 20261016100000_play_catalog_sync.sql. A manual inactive-tier
// upsert cannot establish an active Google Play BUY option or a verified price.
// Keep this command as a safe failure for older runbooks and release scripts.
console.error("Manual Play tier seeding is retired. Apply the reviewed catalog sync migration and run sync-play-catalog after Google Play API setup.");
process.exitCode = 1;
