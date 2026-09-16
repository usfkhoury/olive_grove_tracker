// Olive Grove API — Netlify Functions v2 + Hono.
// Ports FastAPI backend/app/* onto Notion (API 2025-09-03). Int ids preserved
// via [sqlite:{table}#{n}] markers embedded in the Notes field.

import type { Context } from "@netlify/functions";
import { Hono } from "hono";
import type { Context as HonoCtx } from "hono";
import {
  DS, DB,
  createPage, updatePage, archivePage,
  queryAll,
  treeToOut, treeProps,
  harvestToOut, harvestProps,
  oilToOut, oilProps,
  activityToOut, activityProps,
  taskToOut, taskProps,
  nextId, pageIdForInt, invalidateCache, refreshIndex,
  parseMarker,
} from "./lib/notion.js";
import {
  COOKIE_NAME, verifyGoogleIdToken, validSession, issueSession,
  parseCookies, sessionCookieHeader, clearCookieHeader,
  checkRate, recordFailure, clearFailures,
} from "./lib/auth.js";
import { toCsv } from "./lib/csv.js";
import { oilBalance, seasonSummaries, monthInRange } from "./lib/summaries.js";

const COOKIE_SECURE = (process.env.OLIVE_COOKIE_SECURE ?? "true").toLowerCase() !== "false";
const OWNER = () => (process.env.OLIVE_OWNER_EMAIL ?? "").toLowerCase();

const app = new Hono().basePath("/api");

// --------------- auth middleware ---------------
function isAuthed(c: HonoCtx): boolean {
  const cookies = parseCookies(c.req.header("cookie"));
  return validSession(cookies[COOKIE_NAME]);
}
async function requireAdmin(c: HonoCtx, next: () => Promise<void>) {
  if (!isAuthed(c)) return c.json({ detail: "Authentication required" }, 401);
  await next();
}

function clientIp(c: HonoCtx): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return c.req.header("x-nf-client-connection-ip") ?? "unknown";
}

// --------------- auth routes ---------------
app.post("/auth/google", async (c) => {
  const ip = clientIp(c);
  if (!checkRate(ip)) return c.json({ detail: "Too many failed attempts. Try again in 5 minutes." }, 429);
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ detail: "Invalid body" }, 400); }
  const credential = body?.credential;
  if (!credential) return c.json({ detail: "Missing credential" }, 400);
  const v = await verifyGoogleIdToken(credential);
  if (!v.ok) { recordFailure(ip); return c.json({ detail: "Invalid Google credential" }, 401); }
  if (!v.emailVerified || (v.email ?? "").toLowerCase() !== OWNER()) {
    recordFailure(ip);
    return c.json({ detail: "This Google account is not authorized" }, 403);
  }
  clearFailures(ip);
  const cookie = sessionCookieHeader(issueSession(), COOKIE_SECURE);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
});

app.post("/auth/logout", (c) => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearCookieHeader(COOKIE_SECURE) },
  });
});

app.get("/auth/verify", (c) => {
  if (!isAuthed(c)) return c.json({ detail: "Authentication required" }, 401);
  return c.json({ ok: true });
});

// --------------- helpers ---------------
async function fetchAllTrees() {
  const pages = await queryAll(DS.trees());
  return pages.map(treeToOut).sort((a, b) => (a.row - b.row) || (a.col - b.col));
}
async function fetchAllHarvests() {
  const pages = await queryAll(DS.harvests());
  const out = pages.map(harvestToOut);
  out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  return out;
}
async function fetchAllOil() {
  const pages = await queryAll(DS.oil());
  const out = pages.map(oilToOut);
  out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  return out;
}
async function fetchAllActivities() {
  const [treePages, actPages] = await Promise.all([
    queryAll(DS.trees()),
    queryAll(DS.activities()),
  ]);
  const treeLookup = new Map<string, { id: number; label: string }>();
  for (const p of treePages) {
    const marker = parseMarker(p.properties?.Notes?.rich_text ?? []);
    if (marker) treeLookup.set(p.id, { id: marker.id, label: p.properties?.Label?.title?.map((t: any) => t.plain_text ?? "").join("") ?? "" });
  }
  const out = actPages.map((p) => activityToOut(p, treeLookup));
  out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  return out;
}
async function fetchAllTasks() {
  const pages = await queryAll(DS.tasks());
  const out = pages.map(taskToOut);
  out.sort((a, b) => a.start_month - b.start_month || a.id - b.id);
  return out;
}

function stripInternal<T extends Record<string, any>>(o: T): Omit<T, `_${string}`> {
  const out: any = {};
  for (const k of Object.keys(o)) if (!k.startsWith("_")) out[k] = o[k];
  return out;
}

// Locate the paired press oil movement for a harvest.
async function findPressForHarvest(harvestPageId: string) {
  const filter = {
    and: [
      { property: "Kind", select: { equals: "press" } },
      { property: "Harvest", relation: { contains: harvestPageId } },
    ],
  };
  const pages = await queryAll(DS.oil(), filter);
  return pages[0] ? oilToOut(pages[0]) : null;
}

// --------------- trees ---------------
app.get("/trees", async (c) => {
  const rows = await fetchAllTrees();
  return c.json(rows.map(stripInternal));
});
app.get("/trees/:id", async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const rows = await fetchAllTrees();
  const t = rows.find((r) => r.id === id);
  if (!t) return c.json({ detail: "Tree not found" }, 404);
  return c.json(stripInternal(t));
});
app.post("/trees", requireAdmin, async (c) => {
  const data = await c.req.json();
  const id = await nextId("trees");
  const page = await createPage(DB.trees(), treeProps(data, id));
  invalidateCache("trees");
  return c.json(stripInternal(treeToOut(page)), 201);
});
app.put("/trees/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("trees", id);
  if (!pid) return c.json({ detail: "Tree not found" }, 404);
  const data = await c.req.json();
  const page = await updatePage(pid, treeProps(data, id));
  invalidateCache("trees");
  return c.json(stripInternal(treeToOut(page)));
});
app.delete("/trees/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("trees", id);
  if (!pid) return c.json({ detail: "Tree not found" }, 404);
  await archivePage(pid);
  invalidateCache("trees");
  return new Response(null, { status: 204 });
});

// --------------- activities ---------------
app.get("/activities", async (c) => {
  const treeIdParam = c.req.query("tree_id");
  const limit = parseInt(c.req.query("limit") ?? "200", 10);
  let rows = await fetchAllActivities();
  if (treeIdParam) {
    const tid = parseInt(treeIdParam, 10);
    rows = rows.filter((a) => a.trees.some((t) => t.id === tid));
  }
  return c.json(rows.slice(0, limit).map(stripInternal));
});
app.post("/activities", requireAdmin, async (c) => {
  const data = await c.req.json();
  const treeIds: number[] = data.tree_ids ?? [];
  const treePageIds: string[] = [];
  for (const tid of treeIds) {
    const pid = await pageIdForInt("trees", tid);
    if (!pid) return c.json({ detail: "One or more tree ids do not exist" }, 400);
    treePageIds.push(pid);
  }
  const id = await nextId("activities");
  const page = await createPage(DB.activities(), activityProps(data, id, treePageIds));
  invalidateCache("activities");
  // Fetch with lookup for response
  const rows = await fetchAllActivities();
  const created = rows.find((r) => r._pageId === page.id) ?? activityToOut(page, new Map());
  return c.json(stripInternal(created), 201);
});
app.put("/activities/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("activities", id);
  if (!pid) return c.json({ detail: "Activity not found" }, 404);
  const data = await c.req.json();
  const treeIds: number[] = data.tree_ids ?? [];
  const treePageIds: string[] = [];
  for (const tid of treeIds) {
    const p = await pageIdForInt("trees", tid);
    if (!p) return c.json({ detail: "One or more tree ids do not exist" }, 400);
    treePageIds.push(p);
  }
  const page = await updatePage(pid, activityProps(data, id, treePageIds));
  invalidateCache("activities");
  const rows = await fetchAllActivities();
  const upd = rows.find((r) => r._pageId === page.id) ?? activityToOut(page, new Map());
  return c.json(stripInternal(upd));
});
app.delete("/activities/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("activities", id);
  if (!pid) return c.json({ detail: "Activity not found" }, 404);
  await archivePage(pid);
  invalidateCache("activities");
  return new Response(null, { status: 204 });
});

// --------------- harvests ---------------
app.get("/harvests", async (c) => {
  const rows = await fetchAllHarvests();
  return c.json(rows.map(stripInternal));
});
app.get("/harvests/seasons", async (c) => {
  const rows = await fetchAllHarvests();
  return c.json(seasonSummaries(rows));
});
app.post("/harvests", requireAdmin, async (c) => {
  const data = await c.req.json();
  const id = await nextId("harvests");
  const page = await createPage(DB.harvests(), harvestProps(data, id));
  invalidateCache("harvests");
  // Paired press oil movement
  const oilId = await nextId("oil_movements");
  const pressData = {
    date: data.date,
    kind: "press",
    amount_kg: data.oil_kg,
    notes: `Pressing of ${formatNum(data.olives_kg)}kg olives`,
  };
  await createPage(DB.oil(), oilProps(pressData, oilId, page.id));
  invalidateCache("oil_movements");
  return c.json(stripInternal(harvestToOut(page)), 201);
});
app.put("/harvests/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("harvests", id);
  if (!pid) return c.json({ detail: "Harvest not found" }, 404);
  const data = await c.req.json();
  const page = await updatePage(pid, harvestProps(data, id));
  invalidateCache("harvests");
  // Update or create paired press movement
  const existing = await findPressForHarvest(pid);
  const pressData = {
    date: data.date,
    kind: "press",
    amount_kg: data.oil_kg,
    notes: `Pressing of ${formatNum(data.olives_kg)}kg olives`,
  };
  if (existing) {
    await updatePage(existing._pageId, oilProps(pressData, existing.id, pid));
  } else {
    const oilId = await nextId("oil_movements");
    await createPage(DB.oil(), oilProps(pressData, oilId, pid));
  }
  invalidateCache("oil_movements");
  return c.json(stripInternal(harvestToOut(page)));
});
app.delete("/harvests/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("harvests", id);
  if (!pid) return c.json({ detail: "Harvest not found" }, 404);
  const existing = await findPressForHarvest(pid);
  if (existing) await archivePage(existing._pageId);
  await archivePage(pid);
  invalidateCache("harvests");
  invalidateCache("oil_movements");
  return new Response(null, { status: 204 });
});

function formatNum(n: number): string {
  // Python's `{:g}` — trim trailing zeros; up to ~6 sig digits.
  return parseFloat(Number(n).toPrecision(6)).toString();
}

// --------------- oil ---------------
const OUT_KINDS = new Set(["gift", "home", "sale"]);
const VALID_KINDS = new Set(["gift", "home", "sale", "adjustment"]);

app.get("/oil/summary", async (c) => {
  const rows = await fetchAllOil();
  return c.json(oilBalance(rows));
});
app.get("/oil/movements", async (c) => {
  const rows = await fetchAllOil();
  // Attach harvest_id ints (look up by page id in trees->harvests index)
  const hidx = await refreshIndex("harvests");
  const pageToInt = new Map<string, number>();
  for (const [k, v] of hidx.map.entries()) pageToInt.set(v, k);
  const out = rows.map((r) => {
    const hp = r._harvestPageId;
    const hid = hp ? pageToInt.get(hp) ?? null : null;
    return stripInternal({ ...r, harvest_id: hid });
  });
  return c.json(out);
});
app.post("/oil/movements", requireAdmin, async (c) => {
  const data = await c.req.json();
  if (!VALID_KINDS.has(data.kind)) return c.json({ detail: "Invalid kind" }, 422);
  let amount = data.amount_kg;
  if (OUT_KINDS.has(data.kind)) amount = -Math.abs(amount);
  const id = await nextId("oil_movements");
  const payload = { date: data.date, kind: data.kind, amount_kg: amount, notes: data.notes ?? "" };
  const page = await createPage(DB.oil(), oilProps(payload, id, null));
  invalidateCache("oil_movements");
  const out = oilToOut(page);
  return c.json(stripInternal({ ...out, harvest_id: null }), 201);
});
app.delete("/oil/movements/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("oil_movements", id);
  if (!pid) return c.json({ detail: "Movement not found" }, 404);
  // Fetch to verify kind
  const rows = await fetchAllOil();
  const m = rows.find((r) => r._pageId === pid);
  if (m?.kind === "press") return c.json({ detail: "Press movements are managed via harvests" }, 400);
  await archivePage(pid);
  invalidateCache("oil_movements");
  return new Response(null, { status: 204 });
});

// --------------- tasks ---------------
app.get("/tasks", async (c) => {
  const rows = await fetchAllTasks();
  return c.json(rows.map(stripInternal));
});
app.post("/tasks", requireAdmin, async (c) => {
  const data = await c.req.json();
  const id = await nextId("seasonal_tasks");
  const page = await createPage(DB.tasks(), taskProps(data, id));
  invalidateCache("seasonal_tasks");
  return c.json(stripInternal(taskToOut(page)), 201);
});
app.put("/tasks/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("seasonal_tasks", id);
  if (!pid) return c.json({ detail: "Task not found" }, 404);
  const data = await c.req.json();
  const page = await updatePage(pid, taskProps(data, id));
  invalidateCache("seasonal_tasks");
  return c.json(stripInternal(taskToOut(page)));
});
app.delete("/tasks/:id", requireAdmin, async (c) => {
  const id = parseInt(c.req.param("id") ?? "", 10);
  const pid = await pageIdForInt("seasonal_tasks", id);
  if (!pid) return c.json({ detail: "Task not found" }, 404);
  await archivePage(pid);
  invalidateCache("seasonal_tasks");
  return new Response(null, { status: 204 });
});

// --------------- dashboard ---------------
app.get("/dashboard", async (c) => {
  const [trees, harvests, oil, tasks, activities] = await Promise.all([
    fetchAllTrees(),
    fetchAllHarvests(),
    fetchAllOil(),
    fetchAllTasks(),
    fetchAllActivities(),
  ]);
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const month = today.getUTCMonth() + 1;
  const nextMonths = new Set([((month) % 12) + 1, ((month + 1) % 12) + 1]);
  const active: any[] = [], upcoming: any[] = [];
  for (const t of tasks) {
    const clean = stripInternal(t);
    if (monthInRange(month, t.start_month, t.end_month)) active.push(clean);
    else if (nextMonths.has(t.start_month)) upcoming.push(clean);
  }
  const tree_count = trees.filter((t) => t.status === "active").length;
  const recent = activities.slice(0, 5).map(stripInternal);
  return c.json({
    today: todayIso,
    tree_count,
    seasons: seasonSummaries(harvests),
    oil: oilBalance(oil),
    active_tasks: active,
    upcoming_tasks: upcoming,
    recent_activities: recent,
  });
});

// --------------- export ---------------
function csvResponse(entity: string, header: string[], rows: unknown[][]): Response {
  return new Response(toCsv(header, rows), {
    status: 200,
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="${entity}.csv"`,
    },
  });
}

app.get("/export/:entity{.+\\.csv}", async (c) => {
  const entity = c.req.param("entity").replace(/\.csv$/, "");
  if (entity === "trees") {
    const pages = await queryAll(DS.trees());
    const rows = pages.map(treeToOut).sort((a, b) => (a.row - b.row) || (a.col - b.col));
    return csvResponse("trees", ["id","label","row","col","variety","planted_year","status","notes"],
      rows.map((t) => [t.id, t.label, t.row, t.col, t.variety, t.planted_year, t.status, t.notes]));
  }
  if (entity === "activities") {
    const rows = await fetchAllActivities();
    return csvResponse("activities", ["id","date","type","trees","notes"],
      rows.map((a) => [a.id, a.date, a.type, a.trees.map((t) => t.label).join("; "), a.notes]));
  }
  if (entity === "harvests") {
    const pages = await queryAll(DS.harvests());
    const rows = pages.map(harvestToOut).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return csvResponse("harvests", ["id","date","olives_kg","oil_kg","tanake","yield_pct","notes"],
      rows.map((h) => [h.id, h.date, h.olives_kg, h.oil_kg, h.tanake, h.yield_pct, h.notes]));
  }
  if (entity === "oil") {
    const pages = await queryAll(DS.oil());
    const hidx = await refreshIndex("harvests");
    const pageToInt = new Map<string, number>();
    for (const [k, v] of hidx.map.entries()) pageToInt.set(v, k);
    const rows = pages.map(oilToOut).sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id);
    return csvResponse("oil", ["id","date","kind","amount_kg","notes","harvest_id"],
      rows.map((m) => [m.id, m.date, m.kind, m.amount_kg, m.notes, m._harvestPageId ? pageToInt.get(m._harvestPageId) ?? "" : ""]));
  }
  if (entity === "tasks") {
    const rows = await fetchAllTasks();
    return csvResponse("tasks", ["id","name","start_month","end_month","notes"],
      rows.map((t) => [t.id, t.name, t.start_month, t.end_month, t.notes]));
  }
  return c.json({ detail: "Unknown export" }, 404);
});

app.get("/export/all.json", async (c) => {
  const [trees, activities, harvests, oilRows, tasks] = await Promise.all([
    (async () => {
      const pages = await queryAll(DS.trees());
      return pages.map(treeToOut).sort((a, b) => (a.row - b.row) || (a.col - b.col));
    })(),
    fetchAllActivities(),
    (async () => {
      const pages = await queryAll(DS.harvests());
      return pages.map(harvestToOut).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    })(),
    (async () => {
      const pages = await queryAll(DS.oil());
      const hidx = await refreshIndex("harvests");
      const pageToInt = new Map<string, number>();
      for (const [k, v] of hidx.map.entries()) pageToInt.set(v, k);
      return pages
        .map(oilToOut)
        .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id)
        .map((m) => ({
          id: m.id, date: m.date, kind: m.kind, amount_kg: m.amount_kg,
          notes: m.notes, harvest_id: m._harvestPageId ? pageToInt.get(m._harvestPageId) ?? null : null,
        }));
    })(),
    fetchAllTasks(),
  ]);
  return c.json({
    exported_at: new Date().toISOString(),
    trees: trees.map(stripInternal),
    activities: activities.map((a) => ({
      id: a.id, date: a.date, type: a.type,
      trees: a.trees.map((t) => t.label).join("; "),
      notes: a.notes,
    })),
    harvests: harvests.map(stripInternal),
    oil_movements: oilRows,
    seasonal_tasks: tasks.map(stripInternal),
  });
});

// Netlify Functions v2 entrypoint
export default async (req: Request, _context: Context): Promise<Response> => {
  return app.fetch(req);
};

export const config = { path: "/api/*" };

// Also export the app for testing.
export { app };
