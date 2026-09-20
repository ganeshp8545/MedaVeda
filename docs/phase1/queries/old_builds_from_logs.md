# Which app builds are alive, and do any still use public note URLs?

## 1. Play Console (authoritative, no code needed)
Play Console -> your app -> **Statistics** -> metric *Installs by app version* (or *Active installs by app version*),
group by **Version code**. Builds by versionCode:

| versionCode | Built from | Opens notes with |
|---|---|---|
| 1 | commit `898e179` (2026-07-11) | the raw **public URL** (breaks once the notes bucket is private) |
| 2 | no commit in the repo (unknown) | unknown, treat like 1 until you can identify it |
| 3 | commit `6489ce6` (2026-07-25) and every July commit after it up to `580db0a` | **signed URL** (`createSignedUrl`) |
| 4+ | the new 1.1.0 build | signed URL + force-update gate + `app_open` events |

## 2. Check a specific build (AAB/APK), without source
```bash
unzip -p app-release.aab base/assets/index.android.bundle | strings | grep -c "isn't available to you right now"
```
`>0` = that build contains `secureNotesService` (signed URLs). `0` = it opens notes by raw public URL.

## 3. Server side: are any clients still fetching public note URLs?
Dashboard -> Logs -> **API Gateway** (edge logs), run:
```sql
select date_trunc('day', cast(timestamp as datetime)) as day, count(*) as public_note_fetches
from edge_logs cross join unnest(metadata) as m cross join unnest(m.request) as r
where r.path like '/storage/v1/object/public/notes/%' and r.method = 'GET'
group by 1 order by 1 desc limit 30
```
and the signed-URL side, for comparison:
```sql
select date_trunc('day', cast(timestamp as datetime)) as day, count(*) as signed_url_requests
from edge_logs cross join unnest(metadata) as m cross join unnest(m.request) as r
where r.path like '/storage/v1/object/sign/notes/%'
group by 1 order by 1 desc limit 30
```
Public fetches can also come from browsers or scrapers holding an old link, not only old app builds. A steady
daily number that does not fall after the new build is out means someone still uses the public URL: find
out who before Phase 1B.
