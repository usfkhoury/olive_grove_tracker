// Round-trip tests hitting real Notion.
import fs from "node:fs";

const env = fs.readFileSync("/opt/data/.env", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const ids = JSON.parse(fs.readFileSync("/opt/data/olive_notion_migration/db_ids.json", "utf8"));
process.env.NOTION_DS_TREES = ids.Trees.data_source_id;
process.env.NOTION_DS_ACTIVITIES = ids.Activities.data_source_id;
process.env.NOTION_DS_HARVESTS = ids.Harvests.data_source_id;
process.env.NOTION_DS_OIL = ids["Oil movements"].data_source_id;
process.env.NOTION_DS_TASKS = ids["Seasonal tasks"].data_source_id;
process.env.NOTION_DB_TREES = ids.Trees.database_id;
process.env.NOTION_DB_ACTIVITIES = ids.Activities.database_id;
process.env.NOTION_DB_HARVESTS = ids.Harvests.database_id;
process.env.NOTION_DB_OIL = ids["Oil movements"].database_id;
process.env.NOTION_DB_TASKS = ids["Seasonal tasks"].database_id;
process.env.OLIVE_SESSION_SECRET ||= "test-secret-do-not-use";
process.env.GOOGLE_CLIENT_ID ||= "test-client-id";
process.env.OLIVE_OWNER_EMAIL ||= "usf.kh96@gmail.com";
process.env.OLIVE_COOKIE_SECURE = "false";

const { app } = await import("../dist/api.mjs");
const { issueSession } = await import("../dist/lib/auth.js");
const sessionCookie = `olive_session=${issueSession()}`;

const results = [];
async function test(name, method, urlPath, opts = {}) {
  const url = `http://x${urlPath}`;
  const headers = new Headers(opts.headers ?? {});
  if (opts.auth) headers.set("cookie", sessionCookie);
  if (opts.body) headers.set("content-type", "application/json");
  const req = new Request(url, {
    method, headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let res;
  try { res = await app.fetch(req); }
  catch (e) { results.push({ name, method, urlPath, ok: false, note: `throw: ${e.message}` }); return null; }
  const status = res.status;
  const ct = res.headers.get("content-type") || "";
  let body;
  if (ct.includes("application/json")) body = await res.json();
  else body = await res.text();
  const ok = opts.check ? opts.check(status, body, res) : status >= 200 && status < 300;
  const note = opts.note ? opts.note(status, body) : `status=${status}`;
  results.push({ name, method, urlPath, ok, note, status, sample: preview(body) });
  return { status, body, res };
}
function preview(b) {
  if (typeof b === "string") return b.slice(0, 300);
  if (Array.isArray(b)) return `array(${b.length}) ${JSON.stringify(b[0] ?? null).slice(0, 300)}`;
  return JSON.stringify(b).slice(0, 400);
}

// --- READ tests ---
await test("list trees=32", "GET", "/api/trees", {
  check: (s, b) => s === 200 && Array.isArray(b) && b.length === 32 && new Set(b.map((t) => t.id)).size === 32,
  note: (s, b) => `count=${b.length} min_id=${Math.min(...b.map((t) => t.id))} max_id=${Math.max(...b.map((t) => t.id))}`,
});
const harvests = await test("harvests=15 desc by date", "GET", "/api/harvests", {
  check: (s, b) => s === 200 && b.length === 15 && b.every((h, i, a) => i === 0 || a[i - 1].date >= h.date),
  note: (s, b) => `count=${b.length} first=${b[0]?.date} last=${b[b.length-1]?.date}`,
});
await test("harvests/seasons oldest first", "GET", "/api/harvests/seasons", {
  check: (s, b) => s === 200 && b.length > 0 && b.every((x, i, a) => i === 0 || a[i - 1].year <= x.year),
  note: (s, b) => `years=${b.map((x) => x.year).join(",")}`,
});
const oilSum = await test("oil/summary", "GET", "/api/oil/summary", {
  check: (s, b) => s === 200 && "balance_kg" in b,
  note: (s, b) => `bal_kg=${b.balance_kg} tanake=${b.balance_tanake} L=${b.balance_liters}`,
});
const oil = await test("oil/movements=16 w/ adjustment -443.3", "GET", "/api/oil/movements", {
  check: (s, b) => s === 200 && b.length === 16 && b.some((m) => m.kind === "adjustment" && Math.abs(m.amount_kg + 443.3) < 0.01),
  note: (s, b) => `count=${b.length} kinds=${[...new Set(b.map((m) => m.kind))].sort().join(",")}`,
});
if (oil && oilSum) {
  const s = oil.body.reduce((a, m) => a + m.amount_kg, 0);
  results.push({
    name: "oil summary matches sum(movements)",
    method: "-", urlPath: "-",
    ok: Math.abs(s - oilSum.body.balance_kg) < 0.05,
    note: `sum=${s.toFixed(2)} balance=${oilSum.body.balance_kg}`,
  });
}
await test("dashboard", "GET", "/api/dashboard", {
  check: (s, b) => s === 200 && b.tree_count === 32 && Array.isArray(b.seasons) && b.oil && Array.isArray(b.active_tasks) && Array.isArray(b.upcoming_tasks) && Array.isArray(b.recent_activities),
  note: (s, b) => `tree_count=${b.tree_count} seasons=${b.seasons.length} active=${b.active_tasks.length} upcoming=${b.upcoming_tasks.length} recent=${b.recent_activities.length} today=${b.today}`,
});
await test("tasks list", "GET", "/api/tasks", {
  check: (s, b) => s === 200 && Array.isArray(b) && b.length > 0,
  note: (s, b) => `count=${b.length}`,
});
await test("activities list", "GET", "/api/activities", {
  check: (s, b) => s === 200 && Array.isArray(b),
  note: (s, b) => `count=${b.length}`,
});

// export
await test("export/harvests.csv 15 rows + header", "GET", "/api/export/harvests.csv", {
  check: (s, b, r) => s === 200 && r.headers.get("content-type").startsWith("text/csv") && b.split(/\r?\n/).filter((l) => l).length === 16,
  note: (s, b) => `lines=${b.split(/\r?\n/).filter((l) => l).length}`,
});
await test("export/trees.csv 32+header", "GET", "/api/export/trees.csv", {
  check: (s, b) => s === 200 && b.split(/\r?\n/).filter((l) => l).length === 33,
  note: (s, b) => `lines=${b.split(/\r?\n/).filter((l) => l).length}`,
});
await test("export/all.json", "GET", "/api/export/all.json", {
  check: (s, b) => s === 200 && b.trees.length === 32 && b.harvests.length === 15 && b.oil_movements.length === 16,
  note: (s, b) => `trees=${b.trees.length} harvests=${b.harvests.length} oil=${b.oil_movements.length} tasks=${b.seasonal_tasks.length} acts=${b.activities.length}`,
});

// auth negative
await test("bogus google token -> 401", "POST", "/api/auth/google", {
  body: { credential: "not-a-real-token" },
  check: (s) => s === 401,
});
await test("PUT trees without auth -> 401", "PUT", "/api/trees/1", {
  body: { label: "x", row: 0, col: 0, variety: "", planted_year: null, status: "active", notes: "" },
  check: (s) => s === 401,
});
await test("GET /auth/verify no cookie -> 401", "GET", "/api/auth/verify", {
  check: (s) => s === 401,
});
await test("GET /auth/verify w/ cookie -> 200", "GET", "/api/auth/verify", {
  auth: true, check: (s) => s === 200,
});

// --- WRITE round-trip ---
console.log("Round-trip harvest test hitting Notion...");
const createRes = await test("POST /harvests creates harvest + press", "POST", "/api/harvests", {
  auth: true,
  body: { date: "2099-12-31", olives_kg: 100, oil_kg: 20, tanake: 1, notes: "TEST_ROUNDTRIP_TS_DELETE_ME" },
  check: (s, b) => s === 201 && b.id > 0 && b.oil_kg === 20 && b.yield_pct === 20,
  note: (s, b) => `id=${b?.id} yield=${b?.yield_pct}`,
});
const testHarvestId = createRes?.body?.id;

if (testHarvestId) {
  const hlist = await (await app.fetch(new Request(`http://x/api/harvests`))).json();
  const found = hlist.find((h) => h.id === testHarvestId);
  const oilList = await (await app.fetch(new Request(`http://x/api/oil/movements`))).json();
  const press = oilList.find((m) => m.harvest_id === testHarvestId && m.kind === "press");
  results.push({
    name: "new harvest present in GET list",
    method: "GET", urlPath: "/api/harvests",
    ok: !!found, note: `found=${!!found}`,
  });
  results.push({
    name: "paired press oil movement exists w/ correct amount+notes",
    method: "GET", urlPath: "/api/oil/movements",
    ok: !!press && press.amount_kg === 20 && press.notes.includes("Pressing of 100kg"),
    note: press ? `id=${press.id} amount=${press.amount_kg} notes="${press.notes}"` : "no press",
  });

  // PUT (update) — change oil_kg, verify press updates too
  const putRes = await app.fetch(new Request(`http://x/api/harvests/${testHarvestId}`, {
    method: "PUT",
    headers: { cookie: sessionCookie, "content-type": "application/json" },
    body: JSON.stringify({ date: "2099-12-31", olives_kg: 100, oil_kg: 22, tanake: 1, notes: "TEST_ROUNDTRIP_TS_DELETE_ME" }),
  }));
  const putBody = await putRes.json();
  results.push({
    name: "PUT harvest updates oil_kg",
    method: "PUT", urlPath: `/api/harvests/${testHarvestId}`,
    ok: putRes.status === 200 && putBody.oil_kg === 22,
    note: `status=${putRes.status} oil_kg=${putBody.oil_kg}`,
  });
  const oilList2 = await (await app.fetch(new Request(`http://x/api/oil/movements`))).json();
  const press2 = oilList2.find((m) => m.harvest_id === testHarvestId && m.kind === "press");
  results.push({
    name: "paired press updated to oil_kg=22",
    method: "-", urlPath: "-",
    ok: !!press2 && press2.amount_kg === 22,
    note: press2 ? `amount=${press2.amount_kg}` : "no press",
  });

  const del = await app.fetch(new Request(`http://x/api/harvests/${testHarvestId}`, {
    method: "DELETE", headers: { cookie: sessionCookie },
  }));
  results.push({
    name: "DELETE harvest -> 204",
    method: "DELETE", urlPath: `/api/harvests/${testHarvestId}`,
    ok: del.status === 204, note: `status=${del.status}`,
  });
  const hlist2 = await (await app.fetch(new Request(`http://x/api/harvests`))).json();
  const oilList3 = await (await app.fetch(new Request(`http://x/api/oil/movements`))).json();
  const stillH = hlist2.find((h) => h.id === testHarvestId);
  const stillP = oilList3.find((m) => m.harvest_id === testHarvestId);
  results.push({
    name: "after DELETE both harvest and press archived",
    method: "-", urlPath: "-",
    ok: !stillH && !stillP,
    note: `harvest_gone=${!stillH} press_gone=${!stillP}`,
  });
}

// task round-trip
console.log("Round-trip task test...");
const taskCreate = await test("POST /tasks", "POST", "/api/tasks", {
  auth: true, body: { name: "TEST_TASK_DELETE_ME", start_month: 6, end_month: 7, notes: "test" },
  check: (s, b) => s === 201 && b.id > 0 && b.name === "TEST_TASK_DELETE_ME",
  note: (s, b) => `id=${b?.id}`,
});
if (taskCreate?.body?.id) {
  const tid = taskCreate.body.id;
  const del = await app.fetch(new Request(`http://x/api/tasks/${tid}`, {
    method: "DELETE", headers: { cookie: sessionCookie },
  }));
  results.push({
    name: "DELETE task -> 204",
    method: "DELETE", urlPath: `/api/tasks/${tid}`,
    ok: del.status === 204, note: `status=${del.status}`,
  });
}

// oil movement round-trip: reject press deletion attempt
console.log("Oil movement DELETE-press guard test...");
const oilAll = await (await app.fetch(new Request(`http://x/api/oil/movements`))).json();
const pressExisting = oilAll.find((m) => m.kind === "press");
if (pressExisting) {
  const r = await app.fetch(new Request(`http://x/api/oil/movements/${pressExisting.id}`, {
    method: "DELETE", headers: { cookie: sessionCookie },
  }));
  results.push({
    name: "DELETE /oil/movements press -> 400",
    method: "DELETE", urlPath: `/api/oil/movements/${pressExisting.id}`,
    ok: r.status === 400, note: `status=${r.status}`,
  });
}

// print summary
console.log("\n=== RESULTS ===");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} [${r.method} ${r.urlPath}] ${r.name} — ${r.note}`);
  if (!r.ok && r.sample) console.log(`    body: ${r.sample}`);
}
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} passed`);
if (fail) process.exit(1);
