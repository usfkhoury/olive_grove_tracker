/*
 * api.js — Netlify Function for olives.usfkhoury.com.
 *
 * Ports the FastAPI backend to Notion (API 2025-09-03) via @notionhq/client.
 * Reads (GET) are public; writes (POST/PUT/DELETE) require a Google ID token
 * sent as `Authorization: Bearer ***` matching OWNER_EMAIL.
 *
 * Row identity is the Notion page id (uuid). Legacy `[sqlite:<table>#<n>]`
 * markers left over in Notes rich_text are stripped on read so the UI shows
 * clean text; new writes never emit a marker.
 *
 * Env: NOTION_TOKEN, OWNER_EMAIL, GOOGLE_CLIENT_ID,
 *      NOTION_DB_TREES, NOTION_DB_ACTIVITIES,
 *      NOTION_DB_HARVESTS, NOTION_DB_OIL, NOTION_DB_TASKS,
 *      NOTION_DB_CHECKS (optional — /checks returns [] when unset).
 */
const { Client } = require('@notionhq/client');
const { OAuth2Client } = require('google-auth-library');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const DB = {
  trees: process.env.NOTION_DB_TREES,
  activities: process.env.NOTION_DB_ACTIVITIES,
  harvests: process.env.NOTION_DB_HARVESTS,
  oil: process.env.NOTION_DB_OIL,
  tasks: process.env.NOTION_DB_TASKS,
  checks: process.env.NOTION_DB_CHECKS
};

const notion = new Client({ auth: NOTION_TOKEN});
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ---- responses ----
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});
const noContent = () => ({ statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' });
const csvResponse = (name, text) => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="' + name + '.csv"',
    'Cache-Control': 'no-store'
  },
  body: text
});

// ---- auth ----
async function requireOwner(event) {
  if (!GOOGLE_CLIENT_ID) return [500, 'auth not configured'];
  var hdr = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  var token = hdr.indexOf('Bearer ') === 0 ? hdr.slice(7) : '';
  if (!token) return [401, 'Authentication required'];
  try {
    var ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    var p = ticket.getPayload();
    if (!p || !p.email_verified) return [403, 'This Google account is not authorized'];
    return null;
  } catch (e) {
    return [401, 'Invalid or expired sign-in'];
  }
}

// ---- Notion property helpers ----
const num = (v) => (v == null || v === '' ? null : Number(v));
const readNum = (p) => (p && p.number != null ? p.number : null);
const readSelect = (p) => (p && p.select ? p.select.name : null);
const readDate = (p) => (p && p.date ? p.date.start : null);
const readTitle = (p) => (p && p.title && p.title.length ? p.title.map((t) => t.plain_text).join('') : '');
const readRichRaw = (p) => (p && p.rich_text && p.rich_text.length ? p.rich_text.map((t) => t.plain_text).join('') : '');
const readRelIds = (p) => (p && p.relation ? p.relation.map((r) => r.id) : []);

// Legacy: strip any trailing `[sqlite:<table>#<n>]` marker (with the blank line
// migrate.py inserted before it) so old rows still display clean notes.
function notesPlain(rawText) {
  return (rawText || '').replace(/\n*\[sqlite:\w+#\d+\]\s*$/, '').replace(/\s+$/, '');
}
function richText(t) {
  return t ? [{ type: 'text', text: { content: String(t).slice(0, 1900) } }] : [];
}

// ---- paginated query ----
async function queryAll(dbId, filter, sorts) {
  var out = [];
  var cursor;
  do {
    var body = { database_id: dbId, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    var r = await notion.databases.query(body);
    for (var i = 0; i < r.results.length; i++) out.push(r.results[i]);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

// ---- row parsers (id = Notion page uuid) ----
function treeOut(page) {
  var p = page.properties || {};
  return {
    id: page.id,
    label: readTitle(p.Label),
    row: readNum(p.Row) || 0,
    col: readNum(p.Col) || 0,
    variety: readSelect(p.Variety) || '',
    planted_year: readNum(p['Planted year']),
    status: readSelect(p.Status) || 'active',
    notes: notesPlain(readRichRaw(p.Notes))
  };
}
function harvestOut(page) {
  var p = page.properties || {};
  var olives = readNum(p['Olives kg']) || 0;
  var oil = readNum(p['Oil kg']) || 0;
  return {
    id: page.id,
    date: readDate(p.Date) || '',
    olives_kg: olives,
    oil_kg: oil,
    tanake: readNum(p.Tanake),
    notes: notesPlain(readRichRaw(p.Notes)),
    yield_pct: olives > 0 ? Math.round((oil / olives) * 1000) / 10 : null
  };
}
function oilOut(page) {
  var p = page.properties || {};
  var rel = readRelIds(p.Harvest);
  return {
    id: page.id,
    date: readDate(p.Date) || '',
    kind: readSelect(p.Kind) || '',
    amount_kg: readNum(p['Amount kg']) || 0,
    notes: notesPlain(readRichRaw(p.Notes)),
    harvest_id: rel[0] || null
  };
}
// An activity logged from the Calendar links its Seasonal task; its label is the
// task's *current* name (renames propagate). Manual entries have no task and
// show their Type (always "Other" for new rows).
function activityOut(page, treeLookup, taskLookup) {
  var p = page.properties || {};
  var rel = readRelIds(p.Trees);
  var taskId = readRelIds(p.Task)[0] || null;
  var taskName = taskId && taskLookup ? taskLookup.get(taskId) : null;
  var type = readSelect(p.Type) || '';
  var trees = [];
  for (var i = 0; i < rel.length; i++) {
    var t = treeLookup.get(rel[i]);
    if (t) trees.push(t);
  }
  return {
    id: page.id,
    date: readDate(p.Date) || '',
    type: type,
    task_id: taskId,
    label: taskName || type || 'Other',
    notes: notesPlain(readRichRaw(p.Notes)),
    trees: trees
  };
}
function taskOut(page) {
  var p = page.properties || {};
  return {
    id: page.id,
    name: readTitle(p.Name),
    start_month: readNum(p['Start month']) || 1,
    end_month: readNum(p['End month']) || 1,
    notes: notesPlain(readRichRaw(p.Notes))
  };
}

// Tree checks: one row per tree per season. Name is derived (`T12 — 2026`),
// season is parsed back out of it so there is no separate Season property.
const CHECK_OPTIONS = {
  canopy_density: ['Low', 'Medium', 'High', 'Very high'],
  fruit_size: ['Small', 'Medium', 'Big'],
  pruning_planned: ['Skip', 'Light', 'Medium', 'Heavy']
};
function checkOut(page, treeLookup, harvestLookup) {
  var p = page.properties || {};
  var name = readTitle(p.Name);
  var treeId = readRelIds(p.Tree)[0] || null;
  var pressId = readRelIds(p.Press)[0] || null;
  var press = pressId && harvestLookup ? harvestLookup.get(pressId) : null;
  var m = name.match(/(\d{4})\s*$/);
  var season = m ? parseInt(m[1], 10) : (press && press.date ? parseInt(press.date.slice(0, 4), 10) : null);
  var tree = treeId && treeLookup ? treeLookup.get(treeId) : null;
  return {
    id: page.id,
    name: name,
    season: season,
    tree_id: treeId,
    tree_label: tree ? tree.label : '',
    press_id: pressId,
    press_date: press ? press.date : null,
    canopy_density: readSelect(p['Canopy density']),
    fruit_size: readSelect(p['Fruit size']),
    ripeness: readNum(p['Ripeness at harvest']),
    sacks: readNum(p.Sacks),
    pruning_planned: readSelect(p['Pruning planned']),
    notes: notesPlain(readRichRaw(p.Notes))
  };
}

// ---- property builders (no marker) ----
function treeProps(data) {
  return {
    Label: { title: richText(data.label) },
    Row: { number: num(data.row) || 0 },
    Col: { number: num(data.col) || 0 },
    Variety: data.variety ? { select: { name: data.variety } } : { select: null },
    'Planted year': { number: data.planted_year == null ? null : Number(data.planted_year) },
    Status: { select: { name: data.status || 'active' } },
    Notes: { rich_text: richText(data.notes || '') }
  };
}
function harvestProps(data) {
  return {
    Name: { title: richText('Harvest — ' + data.date) },
    Date: { date: { start: data.date } },
    'Olives kg': { number: num(data.olives_kg) },
    'Oil kg': { number: num(data.oil_kg) },
    Tanake: { number: data.tanake == null ? null : Number(data.tanake) },
    Notes: { rich_text: richText(data.notes || '') }
  };
}
function oilProps(data, harvestPageId) {
  var p = {
    Name: { title: richText(data.kind + ' — ' + data.date) },
    Date: { date: { start: data.date } },
    Kind: { select: { name: data.kind } },
    'Amount kg': { number: num(data.amount_kg) },
    Notes: { rich_text: richText(data.notes || '') }
  };
  p.Harvest = harvestPageId ? { relation: [{ id: harvestPageId }] } : { relation: [] };
  return p;
}
function activityProps(data, treePageIds, taskName) {
  var task = data.task_id || null;
  return {
    Name: { title: richText((task ? taskName : 'Other') + ' — ' + data.date) },
    Date: { date: { start: data.date } },
    Type: task ? { select: null } : { select: { name: 'Other' } },
    Task: { relation: task ? [{ id: task }] : [] },
    Trees: { relation: (treePageIds || []).map((pid) => ({ id: pid })) },
    Notes: { rich_text: richText(data.notes || '') }
  };
}
// Resolve + validate an optional task_id; returns [status, msg] on error,
// else the task's name ('' when no task).
async function resolveTask(body) {
  if (!body.task_id) return '';
  if (!isPageId(body.task_id)) return [400, 'Bad task_id'];
  try {
    var tp = await notion.pages.retrieve({ page_id: body.task_id });
    return readTitle((tp.properties || {}).Name);
  } catch (e) { return [400, 'Task not found']; }
}
function taskProps(data) {
  return {
    Name: { title: richText(data.name) },
    'Start month': { number: Number(data.start_month) },
    'End month': { number: Number(data.end_month) },
    Notes: { rich_text: richText(data.notes || '') }
  };
}

function checkSelect(field, v) {
  if (!v) return { select: null };
  if (CHECK_OPTIONS[field].indexOf(v) === -1) throw new RangeError('Invalid ' + field + ': ' + v);
  return { select: { name: v } };
}
function checkProps(data, treeLabel) {
  var rip = data.ripeness == null || data.ripeness === '' ? null : Number(data.ripeness);
  if (rip != null && (isNaN(rip) || rip < 0 || rip > 7)) throw new RangeError('Ripeness must be 0–7');
  return {
    Name: { title: richText(treeLabel + ' — ' + data.season) },
    Tree: { relation: [{ id: data.tree_id }] },
    Press: { relation: data.press_id ? [{ id: data.press_id }] : [] },
    'Canopy density': checkSelect('canopy_density', data.canopy_density),
    'Fruit size': checkSelect('fruit_size', data.fruit_size),
    'Ripeness at harvest': { number: rip },
    Sacks: { number: data.sacks == null || data.sacks === '' ? null : Number(data.sacks) },
    'Pruning planned': checkSelect('pruning_planned', data.pruning_planned),
    Notes: { rich_text: richText(data.notes || '') }
  };
}

// ---- fetch-all helpers ----
async function fetchAllTrees() {
  var pages = await queryAll(DB.trees);
  return pages.map(treeOut).sort((a, b) => (a.row - b.row) || (a.col - b.col));
}
async function fetchAllHarvests() {
  var pages = await queryAll(DB.harvests);
  var out = pages.map(harvestOut);
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return out;
}
async function fetchAllOil() {
  var pages = await queryAll(DB.oil);
  var out = pages.map(oilOut);
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return out;
}
async function fetchAllTasks() {
  var pages = await queryAll(DB.tasks);
  return pages.map(taskOut).sort((a, b) => a.start_month - b.start_month || a.id.localeCompare(b.id));
}
async function fetchAllActivities() {
  var treePages = await queryAll(DB.trees);
  var actPages = await queryAll(DB.activities);
  var taskPages = await queryAll(DB.tasks);
  var lookup = new Map();
  for (var i = 0; i < treePages.length; i++) {
    var tp = treePages[i];
    lookup.set(tp.id, { id: tp.id, label: readTitle(tp.properties && tp.properties.Label) });
  }
  var taskLookup = new Map(taskPages.map((t) => [t.id, readTitle((t.properties || {}).Name)]));
  var out = actPages.map((p) => activityOut(p, lookup, taskLookup));
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return out;
}

async function fetchAllChecks() {
  if (!DB.checks) return [];
  var pages = await queryAll(DB.checks);
  var treeLookup = new Map((await fetchAllTrees()).map((t) => [t.id, t]));
  var harvestLookup = new Map((await fetchAllHarvests()).map((h) => [h.id, h]));
  var out = pages.map((p) => checkOut(p, treeLookup, harvestLookup));
  // Newest season first, then grove order (T1, T2 … not T1, T10).
  var order = new Map(Array.from(treeLookup.values()).map((t, i) => [t.id, i]));
  out.sort((a, b) => (b.season || 0) - (a.season || 0) ||
    (order.get(a.tree_id) ?? 999) - (order.get(b.tree_id) ?? 999));
  return out;
}

// ---- id validation ----
// Notion page ids are 32 hex chars, optionally hyphen-separated as 8-4-4-4-12.
const PAGE_ID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
function isPageId(s) { return typeof s === 'string' && PAGE_ID_RE.test(s); }

// ---- summaries ----
const TANAKE_KG = 15.0;
const OIL_DENSITY = TANAKE_KG / 16.0;

function oilBalance(rows) {
  var bal = 0;
  for (var i = 0; i < rows.length; i++) bal += rows[i].amount_kg || 0;
  return {
    balance_kg: Math.round(bal * 100) / 100,
    balance_tanake: Math.round((bal / TANAKE_KG) * 100) / 100,
    balance_liters: Math.round((bal / OIL_DENSITY) * 10) / 10
  };
}
function seasonSummaries(harvests) {
  var b = new Map();
  for (var i = 0; i < harvests.length; i++) {
    var h = harvests[i];
    var yr = parseInt((h.date || '').slice(0, 4), 10);
    if (!yr) continue;
    var s = b.get(yr);
    if (!s) { s = { year: yr, olives_kg: 0, oil_kg: 0, tanake: 0, sessions: 0 }; b.set(yr, s); }
    s.olives_kg += h.olives_kg || 0;
    s.oil_kg += h.oil_kg || 0;
    s.tanake += h.tanake == null ? 0 : h.tanake;
    s.sessions += 1;
  }
  var arr = Array.from(b.values()).sort((a, z) => a.year - z.year);
  var r2 = (n) => Math.round(n * 100) / 100;
  return arr.map((s) => {
    var oil = r2(s.oil_kg), olives = r2(s.olives_kg);
    return {
      year: s.year, olives_kg: olives, oil_kg: oil, tanake: r2(s.tanake), sessions: s.sessions,
      yield_pct: olives > 0 ? Math.round((oil / olives) * 1000) / 10 : null,
      ratio: oil > 0 ? Math.round((olives / oil) * 10) / 10 : null
    };
  });
}
function monthInRange(month, start, end) {
  if (start <= end) return start <= month && month <= end;
  return month >= start || month <= end;
}

// ---- CSV ----
function csvCell(v) {
  if (v == null) return '';
  var s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(header, rows) {
  var out = [header.map(csvCell).join(',')];
  for (var i = 0; i < rows.length; i++) out.push(rows[i].map(csvCell).join(','));
  return out.join('\n') + '\n';
}

function formatNum(n) {
  return parseFloat(Number(n).toPrecision(6)).toString();
}

// ---- find paired press ----
async function findPressForHarvest(harvestPageId) {
  var pages = await queryAll(DB.oil, {
    and: [
      { property: 'Kind', select: { equals: 'press' } },
      { property: 'Harvest', relation: { contains: harvestPageId } }
    ]
  });
  return pages[0] ? oilOut(pages[0]) : null;
}

// ---- routing ----
function normalizePath(event) {
  var p = event.path || '';
  p = p.replace(/^\/\.netlify\/functions\/api/, '');
  p = p.replace(/^\/api/, '');
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch (e) { return null; }
}

// ---- verify a page belongs to a given DB (unused — retained via retrieve() error) ----

async function handleTrees(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') return json(200, await fetchAllTrees());
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var page = await notion.pages.create({ parent: { database_id: DB.trees }, properties: treeProps(body) });
      return json(201, treeOut(page));
    }
    return json(405, { detail: 'method not allowed' });
  }
  var pid = parts[1];
  if (!isPageId(pid)) return json(400, { detail: 'Bad id' });
  if (method === 'GET') {
    try {
      var page = await notion.pages.retrieve({ page_id: pid });
      if (page.archived) return json(404, { detail: 'Tree not found' });
      return json(200, treeOut(page));
    } catch (e) { return json(404, { detail: 'Tree not found' }); }
  }
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    try {
      var pg = await notion.pages.update({ page_id: pid, properties: treeProps(b1) });
      return json(200, treeOut(pg));
    } catch (e) { return json(404, { detail: 'Tree not found' }); }
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    try {
      await notion.pages.update({ page_id: pid, archived: true });
      return noContent();
    } catch (e) { return json(404, { detail: 'Tree not found' }); }
  }
  return json(405, { detail: 'method not allowed' });
}

async function handleActivities(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') {
      var q = event.queryStringParameters || {};
      var rows = await fetchAllActivities();
      if (q.tree_id) {
        rows = rows.filter((a) => a.trees.some((t) => t.id === q.tree_id));
      }
      var limit = q.limit ? parseInt(q.limit, 10) : 200;
      return json(200, rows.slice(0, limit));
    }
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var treeIds = body.tree_ids || [];
      for (var i = 0; i < treeIds.length; i++) {
        if (!isPageId(treeIds[i])) return json(400, { detail: 'One or more tree ids are invalid' });
      }
      var tn = await resolveTask(body); if (Array.isArray(tn)) return json(tn[0], { detail: tn[1] });
      var page = await notion.pages.create({ parent: { database_id: DB.activities }, properties: activityProps(body, treeIds, tn) });
      // Rebuild with tree labels for the response
      var rows2 = await fetchAllActivities();
      var made = rows2.find((r) => r.id === page.id);
      return json(201, made || activityOut(page, new Map()));
    }
    return json(405, { detail: 'method not allowed' });
  }
  var pid = parts[1];
  if (!isPageId(pid)) return json(400, { detail: 'Bad id' });
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    var tids = b1.tree_ids || [];
    for (var j = 0; j < tids.length; j++) {
      if (!isPageId(tids[j])) return json(400, { detail: 'One or more tree ids are invalid' });
    }
    try {
      var tn1 = await resolveTask(b1); if (Array.isArray(tn1)) return json(tn1[0], { detail: tn1[1] });
      var upd = await notion.pages.update({ page_id: pid, properties: activityProps(b1, tids, tn1) });
      var rows3 = await fetchAllActivities();
      var u = rows3.find((r) => r.id === upd.id);
      return json(200, u || activityOut(upd, new Map()));
    } catch (e) { return json(404, { detail: 'Activity not found' }); }
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    try {
      await notion.pages.update({ page_id: pid, archived: true });
      return noContent();
    } catch (e) { return json(404, { detail: 'Activity not found' }); }
  }
  return json(405, { detail: 'method not allowed' });
}

async function handleHarvests(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') return json(200, await fetchAllHarvests());
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var page = await notion.pages.create({ parent: { database_id: DB.harvests }, properties: harvestProps(body) });
      var pressData = { date: body.date, kind: 'press', amount_kg: body.oil_kg,
        notes: 'Pressing of ' + formatNum(body.olives_kg) + 'kg olives' };
      await notion.pages.create({ parent: { database_id: DB.oil }, properties: oilProps(pressData, page.id) });
      return json(201, harvestOut(page));
    }
    return json(405, { detail: 'method not allowed' });
  }
  if (parts[1] === 'seasons') {
    if (method !== 'GET') return json(405, { detail: 'method not allowed' });
    return json(200, seasonSummaries(await fetchAllHarvests()));
  }
  var pid = parts[1];
  if (!isPageId(pid)) return json(400, { detail: 'Bad id' });
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    try {
      var pg = await notion.pages.update({ page_id: pid, properties: harvestProps(b1) });
      var existing = await findPressForHarvest(pid);
      var pd = { date: b1.date, kind: 'press', amount_kg: b1.oil_kg,
        notes: 'Pressing of ' + formatNum(b1.olives_kg) + 'kg olives' };
      if (existing) {
        await notion.pages.update({ page_id: existing.id, properties: oilProps(pd, pid) });
      } else {
        await notion.pages.create({ parent: { database_id: DB.oil }, properties: oilProps(pd, pid) });
      }
      return json(200, harvestOut(pg));
    } catch (e) { return json(404, { detail: 'Harvest not found' }); }
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    try {
      var ex = await findPressForHarvest(pid);
      if (ex) await notion.pages.update({ page_id: ex.id, archived: true });
      await notion.pages.update({ page_id: pid, archived: true });
      return noContent();
    } catch (e) { return json(404, { detail: 'Harvest not found' }); }
  }
  return json(405, { detail: 'method not allowed' });
}

async function validateCheckBody(body) {
  if (!isPageId(body.tree_id)) return [400, 'tree_id is required'];
  if (body.press_id && !isPageId(body.press_id)) return [400, 'Bad press_id'];
  var season = parseInt(body.season, 10);
  if (!(season >= 2000 && season <= 2100)) return [400, 'season must be a year'];
  body.season = season;
  try {
    var tp = await notion.pages.retrieve({ page_id: body.tree_id });
    return { label: readTitle((tp.properties || {}).Label) };
  } catch (e) { return [400, 'Tree not found']; }
}

async function handleChecks(method, parts, event) {
  if (!DB.checks) {
    if (method === 'GET' && parts.length === 1) return json(200, []);
    return json(500, { detail: 'Tree checks not configured (NOTION_DB_CHECKS).' });
  }
  if (parts.length === 1) {
    if (method === 'GET') {
      var q = event.queryStringParameters || {};
      var rows = await fetchAllChecks();
      if (q.tree_id) rows = rows.filter((c) => c.tree_id === q.tree_id);
      if (q.season) rows = rows.filter((c) => String(c.season) === String(q.season));
      return json(200, rows);
    }
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var v = await validateCheckBody(body); if (Array.isArray(v)) return json(v[0], { detail: v[1] });
      var dupes = (await fetchAllChecks()).filter((c) => c.tree_id === body.tree_id && c.season === body.season);
      if (dupes.length) return json(409, { detail: v.label + ' already has a ' + body.season + ' check' });
      var props;
      try { props = checkProps(body, v.label); } catch (e) { return json(422, { detail: e.message }); }
      var page = await notion.pages.create({ parent: { database_id: DB.checks }, properties: props });
      var made = (await fetchAllChecks()).find((c) => c.id === page.id);
      return json(201, made || checkOut(page));
    }
    return json(405, { detail: 'method not allowed' });
  }
  var pid = parts[1];
  if (!isPageId(pid)) return json(400, { detail: 'Bad id' });
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    var v1 = await validateCheckBody(b1); if (Array.isArray(v1)) return json(v1[0], { detail: v1[1] });
    var props1;
    try { props1 = checkProps(b1, v1.label); } catch (e) { return json(422, { detail: e.message }); }
    try {
      await notion.pages.update({ page_id: pid, properties: props1 });
    } catch (e) { return json(404, { detail: 'Check not found' }); }
    var u = (await fetchAllChecks()).find((c) => c.id === pid);
    return u ? json(200, u) : json(404, { detail: 'Check not found' });
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    try {
      await notion.pages.update({ page_id: pid, archived: true });
      return noContent();
    } catch (e) { return json(404, { detail: 'Check not found' }); }
  }
  return json(405, { detail: 'method not allowed' });
}

const OUT_KINDS = { gift: 1, home: 1, sale: 1 };
const VALID_KINDS = { gift: 1, home: 1, sale: 1, adjustment: 1 };

async function handleOil(method, parts, event) {
  if (parts.length < 2) return json(404, { detail: 'not found' });
  if (parts[1] === 'summary' && method === 'GET') {
    return json(200, oilBalance(await fetchAllOil()));
  }
  if (parts[1] === 'movements') {
    if (parts.length === 2) {
      if (method === 'GET') return json(200, await fetchAllOil());
      if (method === 'POST') {
        var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
        var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
        if (!VALID_KINDS[body.kind]) return json(422, { detail: 'Invalid kind' });
        var amount = Number(body.amount_kg);
        if (OUT_KINDS[body.kind]) amount = -Math.abs(amount);
        var payload = { date: body.date, kind: body.kind, amount_kg: amount, notes: body.notes || '' };
        var page = await notion.pages.create({ parent: { database_id: DB.oil }, properties: oilProps(payload, null) });
        return json(201, oilOut(page));
      }
      return json(405, { detail: 'method not allowed' });
    }
    var pid = parts[2];
    if (!isPageId(pid)) return json(400, { detail: 'Bad id' });
    if (method === 'DELETE') {
      var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
      try {
        var page = await notion.pages.retrieve({ page_id: pid });
        var kind = readSelect((page.properties || {}).Kind);
        if (kind === 'press') return json(400, { detail: 'Press movements are managed via harvests' });
        await notion.pages.update({ page_id: pid, archived: true });
        return noContent();
      } catch (e) { return json(404, { detail: 'Movement not found' }); }
    }
  }
  return json(404, { detail: 'not found' });
}

async function handleTasks(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') return json(200, await fetchAllTasks());
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var page = await notion.pages.create({ parent: { database_id: DB.tasks }, properties: taskProps(body) });
      return json(201, taskOut(page));
    }
    return json(405, { detail: 'method not allowed' });
  }
  var pid = parts[1];
  if (!isPageId(pid)) return json(400, { detail: 'Bad id' });
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    try {
      var pg = await notion.pages.update({ page_id: pid, properties: taskProps(b1) });
      return json(200, taskOut(pg));
    } catch (e) { return json(404, { detail: 'Task not found' }); }
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    try {
      await notion.pages.update({ page_id: pid, archived: true });
      return noContent();
    } catch (e) { return json(404, { detail: 'Task not found' }); }
  }
  return json(405, { detail: 'method not allowed' });
}

async function handleDashboard() {
  var trees = await fetchAllTrees();
  var harvests = await fetchAllHarvests();
  var oil = await fetchAllOil();
  var tasks = await fetchAllTasks();
  var activities = await fetchAllActivities();
  var today = new Date();
  var iso = today.toISOString().slice(0, 10);
  var month = today.getUTCMonth() + 1;
  var nm1 = (month % 12) + 1;
  var nm2 = ((month + 1) % 12) + 1;
  var active = [], upcoming = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (monthInRange(month, t.start_month, t.end_month)) active.push(t);
    else if (t.start_month === nm1 || t.start_month === nm2) upcoming.push(t);
  }
  return json(200, {
    today: iso,
    tree_count: trees.filter((t) => t.status === 'active').length,
    seasons: seasonSummaries(harvests),
    oil: oilBalance(oil),
    active_tasks: active,
    upcoming_tasks: upcoming,
    recent_activities: activities.slice(0, 5)
  });
}

async function handleExport(parts) {
  var f = parts[1] || '';
  if (f === 'trees.csv') {
    var rows = await fetchAllTrees();
    return csvResponse('trees', toCsv(['id','label','row','col','variety','planted_year','status','notes'],
      rows.map((t) => [t.id, t.label, t.row, t.col, t.variety, t.planted_year, t.status, t.notes])));
  }
  if (f === 'activities.csv') {
    var rows2 = await fetchAllActivities();
    return csvResponse('activities', toCsv(['id','date','activity','trees','notes'],
      rows2.map((a) => [a.id, a.date, a.label, a.trees.map((t) => t.label).join('; '), a.notes])));
  }
  if (f === 'harvests.csv') {
    var rows3 = (await fetchAllHarvests()).slice().sort((a, b) => a.date.localeCompare(b.date));
    return csvResponse('harvests', toCsv(['id','date','olives_kg','oil_kg','tanake','yield_pct','notes'],
      rows3.map((h) => [h.id, h.date, h.olives_kg, h.oil_kg, h.tanake, h.yield_pct, h.notes])));
  }
  if (f === 'oil.csv') {
    var rows4 = (await fetchAllOil()).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return csvResponse('oil', toCsv(['id','date','kind','amount_kg','notes','harvest_id'],
      rows4.map((mv) => [mv.id, mv.date, mv.kind, mv.amount_kg, mv.notes, mv.harvest_id || ''])));
  }
  if (f === 'tasks.csv') {
    var rows5 = await fetchAllTasks();
    return csvResponse('tasks', toCsv(['id','name','start_month','end_month','notes'],
      rows5.map((t) => [t.id, t.name, t.start_month, t.end_month, t.notes])));
  }
  if (f === 'checks.csv') {
    var rows6 = (await fetchAllChecks()).slice().reverse();
    return csvResponse('tree_checks', toCsv(['id','tree','season','press_date','canopy_density','fruit_size','ripeness','sacks','pruning_planned','notes'],
      rows6.map((c) => [c.id, c.tree_label, c.season, c.press_date || '', c.canopy_density || '', c.fruit_size || '', c.ripeness, c.sacks, c.pruning_planned || '', c.notes])));
  }
  if (f === 'all.json') {
    var trees = await fetchAllTrees();
    var acts = await fetchAllActivities();
    var harvs = (await fetchAllHarvests()).slice().sort((a, b) => a.date.localeCompare(b.date));
    var oils = (await fetchAllOil()).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    var tsks = await fetchAllTasks();
    var chks = await fetchAllChecks();
    return json(200, {
      exported_at: new Date().toISOString(),
      trees: trees,
      activities: acts.map((a) => ({ id: a.id, date: a.date, activity: a.label, task_id: a.task_id, trees: a.trees.map((t) => t.label).join('; '), notes: a.notes })),
      harvests: harvs,
      oil_movements: oils,
      seasonal_tasks: tsks,
      tree_checks: chks
    });
  }
  return json(404, { detail: 'Unknown export' });
}

async function handleAuth(method, parts, event) {
  var action = parts[1] || '';
  if (action === 'verify' && method === 'POST') {
    var d = await requireOwner(event);
    if (d) return json(d[0], { detail: d[1] });
    return json(200, { ok: true });
  }
  if (action === 'logout' && method === 'POST') {
    return json(200, { ok: true });
  }
  return json(404, { detail: 'not found' });
}

exports.handler = async (event) => {
  try {
    if (!NOTION_TOKEN || !DB.trees || !DB.activities || !DB.harvests || !DB.oil || !DB.tasks) {
      return json(500, { detail: 'Server not configured (missing Notion env vars).' });
    }
    var path = normalizePath(event);
    var parts = path.split('/').filter((s) => s.length > 0);
    var method = event.httpMethod || 'GET';
    if (parts.length === 0) return json(200, { ok: true, service: 'olive-grove-api' });
    var head = parts[0];
    if (head === 'trees') return await handleTrees(method, parts, event);
    if (head === 'activities') return await handleActivities(method, parts, event);
    if (head === 'harvests') return await handleHarvests(method, parts, event);
    if (head === 'oil') return await handleOil(method, parts, event);
    if (head === 'tasks') return await handleTasks(method, parts, event);
    if (head === 'checks') return await handleChecks(method, parts, event);
    if (head === 'dashboard' && method === 'GET') return await handleDashboard();
    if (head === 'export' && method === 'GET') return await handleExport(parts);
    if (head === 'auth') return await handleAuth(method, parts, event);
    return json(404, { detail: 'not found' });
  } catch (err) {
    return json(500, { detail: String((err && err.message) || err) });
  }
};
