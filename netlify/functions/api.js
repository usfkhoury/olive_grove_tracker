/*
 * api.js — Netlify Function for olives.usfkhoury.com.
 *
 * Ports the FastAPI backend to Notion (API 2025-09-03) via @notionhq/client.
 * Reads (GET) are public; writes (POST/PUT/DELETE) require a Google ID token
 * sent as `Authorization: Bearer <token>` matching OWNER_EMAIL.
 *
 * Original integer ids are preserved via a `[sqlite:<table>#<n>]` marker
 * embedded at the end of each page's Notes rich_text.
 *
 * Env: NOTION_TOKEN, OWNER_EMAIL, GOOGLE_CLIENT_ID,
 *      NOTION_DB_TREES, NOTION_DB_ACTIVITIES,
 *      NOTION_DB_HARVESTS, NOTION_DB_OIL, NOTION_DB_TASKS.
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
  tasks: process.env.NOTION_DB_TASKS
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

const MARKER_RE = /\[sqlite:(\w+)#(\d+)\]/;
function parseMarker(rawText) {
  var m = (rawText || '').match(MARKER_RE);
  return m ? { table: m[1], id: parseInt(m[2], 10) } : null;
}
function notesPlain(rawText) {
  return (rawText || '').replace(/\n*\[sqlite:\w+#\d+\]\s*$/, '').replace(/\s+$/, '');
}
function richWithMarker(notes, table, id) {
  var marker = '[sqlite:' + table + '#' + id + ']';
  var combined = notes ? (notes + '\n\n' + marker) : marker;
  return [{ type: 'text', text: { content: combined.slice(0, 1900) } }];
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

// ---- row parsers ----
function treeOut(page) {
  var p = page.properties || {};
  var m = parseMarker(readRichRaw(p.Notes));
  return {
    id: m ? m.id : 0,
    label: readTitle(p.Label),
    row: readNum(p.Row) || 0,
    col: readNum(p.Col) || 0,
    variety: readSelect(p.Variety) || '',
    planted_year: readNum(p['Planted year']),
    status: readSelect(p.Status) || 'active',
    notes: notesPlain(readRichRaw(p.Notes)),
    _pageId: page.id
  };
}
function harvestOut(page) {
  var p = page.properties || {};
  var m = parseMarker(readRichRaw(p.Notes));
  var olives = readNum(p['Olives kg']) || 0;
  var oil = readNum(p['Oil kg']) || 0;
  return {
    id: m ? m.id : 0,
    date: readDate(p.Date) || '',
    olives_kg: olives,
    oil_kg: oil,
    tanake: readNum(p.Tanake),
    notes: notesPlain(readRichRaw(p.Notes)),
    yield_pct: olives > 0 ? Math.round((oil / olives) * 1000) / 10 : null,
    _pageId: page.id
  };
}
function oilOut(page) {
  var p = page.properties || {};
  var m = parseMarker(readRichRaw(p.Notes));
  var rel = readRelIds(p.Harvest);
  return {
    id: m ? m.id : 0,
    date: readDate(p.Date) || '',
    kind: readSelect(p.Kind) || '',
    amount_kg: readNum(p['Amount kg']) || 0,
    notes: notesPlain(readRichRaw(p.Notes)),
    _pageId: page.id,
    _harvestPageId: rel[0] || null
  };
}
function activityOut(page, treeLookup) {
  var p = page.properties || {};
  var m = parseMarker(readRichRaw(p.Notes));
  var rel = readRelIds(p.Trees);
  var trees = [];
  for (var i = 0; i < rel.length; i++) {
    var t = treeLookup.get(rel[i]);
    if (t) trees.push(t);
  }
  return {
    id: m ? m.id : 0,
    date: readDate(p.Date) || '',
    type: readSelect(p.Type) || '',
    notes: notesPlain(readRichRaw(p.Notes)),
    trees: trees,
    _pageId: page.id
  };
}
function taskOut(page) {
  var p = page.properties || {};
  var m = parseMarker(readRichRaw(p.Notes));
  return {
    id: m ? m.id : 0,
    name: readTitle(p.Name),
    start_month: readNum(p['Start month']) || 1,
    end_month: readNum(p['End month']) || 1,
    notes: notesPlain(readRichRaw(p.Notes)),
    _pageId: page.id
  };
}

// ---- property builders ----
function treeProps(data, id) {
  return {
    Label: { title: richText(data.label) },
    Row: { number: num(data.row) || 0 },
    Col: { number: num(data.col) || 0 },
    Variety: data.variety ? { select: { name: data.variety } } : { select: null },
    'Planted year': { number: data.planted_year == null ? null : Number(data.planted_year) },
    Status: { select: { name: data.status || 'active' } },
    Notes: { rich_text: richWithMarker(data.notes || '', 'trees', id) }
  };
}
function harvestProps(data, id) {
  return {
    Name: { title: richText('Harvest — ' + data.date) },
    Date: { date: { start: data.date } },
    'Olives kg': { number: num(data.olives_kg) },
    'Oil kg': { number: num(data.oil_kg) },
    Tanake: { number: data.tanake == null ? null : Number(data.tanake) },
    Notes: { rich_text: richWithMarker(data.notes || '', 'harvests', id) }
  };
}
function oilProps(data, id, harvestPageId) {
  var p = {
    Name: { title: richText(data.kind + ' — ' + data.date) },
    Date: { date: { start: data.date } },
    Kind: { select: { name: data.kind } },
    'Amount kg': { number: num(data.amount_kg) },
    Notes: { rich_text: richWithMarker(data.notes || '', 'oil_movements', id) }
  };
  p.Harvest = harvestPageId ? { relation: [{ id: harvestPageId }] } : { relation: [] };
  return p;
}
function activityProps(data, id, treePageIds) {
  return {
    Name: { title: richText(data.type + ' — ' + data.date) },
    Date: { date: { start: data.date } },
    Type: { select: { name: data.type } },
    Trees: { relation: (treePageIds || []).map((pid) => ({ id: pid })) },
    Notes: { rich_text: richWithMarker(data.notes || '', 'activities', id) }
  };
}
function taskProps(data, id) {
  return {
    Name: { title: richText(data.name) },
    'Start month': { number: Number(data.start_month) },
    'End month': { number: Number(data.end_month) },
    Notes: { rich_text: richWithMarker(data.notes || '', 'seasonal_tasks', id) }
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
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return out;
}
async function fetchAllOil() {
  var pages = await queryAll(DB.oil);
  var out = pages.map(oilOut);
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return out;
}
async function fetchAllTasks() {
  var pages = await queryAll(DB.tasks);
  return pages.map(taskOut).sort((a, b) => a.start_month - b.start_month || a.id - b.id);
}
async function fetchAllActivities() {
  var treePages = await queryAll(DB.trees);
  var actPages = await queryAll(DB.activities);
  var lookup = new Map();
  for (var i = 0; i < treePages.length; i++) {
    var tp = treePages[i];
    var mk = parseMarker(readRichRaw(tp.properties && tp.properties.Notes));
    if (mk) lookup.set(tp.id, { id: mk.id, label: readTitle(tp.properties && tp.properties.Label) });
  }
  var out = actPages.map((p) => activityOut(p, lookup));
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return out;
}

// ---- int-id -> page-id ----
async function pageIdForInt(dbId, table, intId) {
  var pages = await queryAll(dbId);
  for (var i = 0; i < pages.length; i++) {
    var mk = parseMarker(readRichRaw(pages[i].properties && pages[i].properties.Notes));
    if (mk && mk.table === table && mk.id === intId) return pages[i].id;
  }
  return null;
}
async function nextId(dbId, table) {
  var pages = await queryAll(dbId);
  var max = 0;
  for (var i = 0; i < pages.length; i++) {
    var mk = parseMarker(readRichRaw(pages[i].properties && pages[i].properties.Notes));
    if (mk && mk.table === table && mk.id > max) max = mk.id;
  }
  return max + 1;
}
async function harvestPageIdToIntMap() {
  var pages = await queryAll(DB.harvests);
  var m = new Map();
  for (var i = 0; i < pages.length; i++) {
    var mk = parseMarker(readRichRaw(pages[i].properties && pages[i].properties.Notes));
    if (mk) m.set(pages[i].id, mk.id);
  }
  return m;
}

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

// ---- strip _internal ----
function strip(o) {
  var out = {};
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && k[0] !== '_') out[k] = o[k];
  return out;
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
  // Strip Netlify function prefix if present.
  p = p.replace(/^\/\.netlify\/functions\/api/, '');
  p = p.replace(/^\/api/, '');
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch (e) { return null; }
}

async function handleTrees(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') return json(200, (await fetchAllTrees()).map(strip));
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var id = await nextId(DB.trees, 'trees');
      var page = await notion.pages.create({ parent: { database_id: DB.trees }, properties: treeProps(body, id) });
      return json(201, strip(treeOut(page)));
    }
    return json(405, { detail: 'method not allowed' });
  }
  var intId = parseInt(parts[1], 10);
  if (!Number.isInteger(intId)) return json(400, { detail: 'Bad id' });
  if (method === 'GET') {
    var rows = await fetchAllTrees();
    var t = rows.find((r) => r.id === intId);
    if (!t) return json(404, { detail: 'Tree not found' });
    return json(200, strip(t));
  }
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var pid = await pageIdForInt(DB.trees, 'trees', intId);
    if (!pid) return json(404, { detail: 'Tree not found' });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    var pg = await notion.pages.update({ page_id: pid, properties: treeProps(b1, intId) });
    return json(200, strip(treeOut(pg)));
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    var pid2 = await pageIdForInt(DB.trees, 'trees', intId);
    if (!pid2) return json(404, { detail: 'Tree not found' });
    await notion.pages.update({ page_id: pid2, archived: true });
    return noContent();
  }
  return json(405, { detail: 'method not allowed' });
}

async function handleActivities(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') {
      var q = event.queryStringParameters || {};
      var rows = await fetchAllActivities();
      if (q.tree_id) {
        var tid = parseInt(q.tree_id, 10);
        rows = rows.filter((a) => a.trees.some((t) => t.id === tid));
      }
      var limit = q.limit ? parseInt(q.limit, 10) : 200;
      return json(200, rows.slice(0, limit).map(strip));
    }
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var treeIds = body.tree_ids || [];
      var treePageIds = [];
      for (var i = 0; i < treeIds.length; i++) {
        var pid = await pageIdForInt(DB.trees, 'trees', treeIds[i]);
        if (!pid) return json(400, { detail: 'One or more tree ids do not exist' });
        treePageIds.push(pid);
      }
      var id = await nextId(DB.activities, 'activities');
      var page = await notion.pages.create({ parent: { database_id: DB.activities }, properties: activityProps(body, id, treePageIds) });
      var rows2 = await fetchAllActivities();
      var made = rows2.find((r) => r._pageId === page.id);
      return json(201, strip(made || activityOut(page, new Map())));
    }
    return json(405, { detail: 'method not allowed' });
  }
  var intId = parseInt(parts[1], 10);
  if (!Number.isInteger(intId)) return json(400, { detail: 'Bad id' });
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var pidx = await pageIdForInt(DB.activities, 'activities', intId);
    if (!pidx) return json(404, { detail: 'Activity not found' });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    var tpids = [];
    var tids = b1.tree_ids || [];
    for (var j = 0; j < tids.length; j++) {
      var p2 = await pageIdForInt(DB.trees, 'trees', tids[j]);
      if (!p2) return json(400, { detail: 'One or more tree ids do not exist' });
      tpids.push(p2);
    }
    var upd = await notion.pages.update({ page_id: pidx, properties: activityProps(b1, intId, tpids) });
    var rows3 = await fetchAllActivities();
    var u = rows3.find((r) => r._pageId === upd.id);
    return json(200, strip(u || activityOut(upd, new Map())));
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    var pid3 = await pageIdForInt(DB.activities, 'activities', intId);
    if (!pid3) return json(404, { detail: 'Activity not found' });
    await notion.pages.update({ page_id: pid3, archived: true });
    return noContent();
  }
  return json(405, { detail: 'method not allowed' });
}

async function handleHarvests(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') return json(200, (await fetchAllHarvests()).map(strip));
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var id = await nextId(DB.harvests, 'harvests');
      var page = await notion.pages.create({ parent: { database_id: DB.harvests }, properties: harvestProps(body, id) });
      var oilId = await nextId(DB.oil, 'oil_movements');
      var pressData = { date: body.date, kind: 'press', amount_kg: body.oil_kg,
        notes: 'Pressing of ' + formatNum(body.olives_kg) + 'kg olives' };
      await notion.pages.create({ parent: { database_id: DB.oil }, properties: oilProps(pressData, oilId, page.id) });
      return json(201, strip(harvestOut(page)));
    }
    return json(405, { detail: 'method not allowed' });
  }
  if (parts[1] === 'seasons') {
    if (method !== 'GET') return json(405, { detail: 'method not allowed' });
    return json(200, seasonSummaries(await fetchAllHarvests()));
  }
  var intId = parseInt(parts[1], 10);
  if (!Number.isInteger(intId)) return json(400, { detail: 'Bad id' });
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var pid = await pageIdForInt(DB.harvests, 'harvests', intId);
    if (!pid) return json(404, { detail: 'Harvest not found' });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    var pg = await notion.pages.update({ page_id: pid, properties: harvestProps(b1, intId) });
    var existing = await findPressForHarvest(pid);
    var pd = { date: b1.date, kind: 'press', amount_kg: b1.oil_kg,
      notes: 'Pressing of ' + formatNum(b1.olives_kg) + 'kg olives' };
    if (existing) {
      await notion.pages.update({ page_id: existing._pageId, properties: oilProps(pd, existing.id, pid) });
    } else {
      var nid = await nextId(DB.oil, 'oil_movements');
      await notion.pages.create({ parent: { database_id: DB.oil }, properties: oilProps(pd, nid, pid) });
    }
    return json(200, strip(harvestOut(pg)));
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    var pid2 = await pageIdForInt(DB.harvests, 'harvests', intId);
    if (!pid2) return json(404, { detail: 'Harvest not found' });
    var ex = await findPressForHarvest(pid2);
    if (ex) await notion.pages.update({ page_id: ex._pageId, archived: true });
    await notion.pages.update({ page_id: pid2, archived: true });
    return noContent();
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
      if (method === 'GET') {
        var rows = await fetchAllOil();
        var m = await harvestPageIdToIntMap();
        return json(200, rows.map((r) => {
          var o = strip(r);
          o.harvest_id = r._harvestPageId ? (m.get(r._harvestPageId) || null) : null;
          return o;
        }));
      }
      if (method === 'POST') {
        var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
        var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
        if (!VALID_KINDS[body.kind]) return json(422, { detail: 'Invalid kind' });
        var amount = Number(body.amount_kg);
        if (OUT_KINDS[body.kind]) amount = -Math.abs(amount);
        var id = await nextId(DB.oil, 'oil_movements');
        var payload = { date: body.date, kind: body.kind, amount_kg: amount, notes: body.notes || '' };
        var page = await notion.pages.create({ parent: { database_id: DB.oil }, properties: oilProps(payload, id, null) });
        var o = strip(oilOut(page));
        o.harvest_id = null;
        return json(201, o);
      }
      return json(405, { detail: 'method not allowed' });
    }
    var intId = parseInt(parts[2], 10);
    if (!Number.isInteger(intId)) return json(400, { detail: 'Bad id' });
    if (method === 'DELETE') {
      var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
      var pid = await pageIdForInt(DB.oil, 'oil_movements', intId);
      if (!pid) return json(404, { detail: 'Movement not found' });
      var rows2 = await fetchAllOil();
      var mv = rows2.find((r) => r._pageId === pid);
      if (mv && mv.kind === 'press') return json(400, { detail: 'Press movements are managed via harvests' });
      await notion.pages.update({ page_id: pid, archived: true });
      return noContent();
    }
  }
  return json(404, { detail: 'not found' });
}

async function handleTasks(method, parts, event) {
  if (parts.length === 1) {
    if (method === 'GET') return json(200, (await fetchAllTasks()).map(strip));
    if (method === 'POST') {
      var d = await requireOwner(event); if (d) return json(d[0], { detail: d[1] });
      var body = parseBody(event); if (body == null) return json(400, { detail: 'Invalid body' });
      var id = await nextId(DB.tasks, 'seasonal_tasks');
      var page = await notion.pages.create({ parent: { database_id: DB.tasks }, properties: taskProps(body, id) });
      return json(201, strip(taskOut(page)));
    }
    return json(405, { detail: 'method not allowed' });
  }
  var intId = parseInt(parts[1], 10);
  if (!Number.isInteger(intId)) return json(400, { detail: 'Bad id' });
  if (method === 'PUT') {
    var d1 = await requireOwner(event); if (d1) return json(d1[0], { detail: d1[1] });
    var pid = await pageIdForInt(DB.tasks, 'seasonal_tasks', intId);
    if (!pid) return json(404, { detail: 'Task not found' });
    var b1 = parseBody(event); if (b1 == null) return json(400, { detail: 'Invalid body' });
    var pg = await notion.pages.update({ page_id: pid, properties: taskProps(b1, intId) });
    return json(200, strip(taskOut(pg)));
  }
  if (method === 'DELETE') {
    var d2 = await requireOwner(event); if (d2) return json(d2[0], { detail: d2[1] });
    var pid2 = await pageIdForInt(DB.tasks, 'seasonal_tasks', intId);
    if (!pid2) return json(404, { detail: 'Task not found' });
    await notion.pages.update({ page_id: pid2, archived: true });
    return noContent();
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
    var t = strip(tasks[i]);
    if (monthInRange(month, tasks[i].start_month, tasks[i].end_month)) active.push(t);
    else if (tasks[i].start_month === nm1 || tasks[i].start_month === nm2) upcoming.push(t);
  }
  return json(200, {
    today: iso,
    tree_count: trees.filter((t) => t.status === 'active').length,
    seasons: seasonSummaries(harvests),
    oil: oilBalance(oil),
    active_tasks: active,
    upcoming_tasks: upcoming,
    recent_activities: activities.slice(0, 5).map(strip)
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
    return csvResponse('activities', toCsv(['id','date','type','trees','notes'],
      rows2.map((a) => [a.id, a.date, a.type, a.trees.map((t) => t.label).join('; '), a.notes])));
  }
  if (f === 'harvests.csv') {
    var rows3 = (await fetchAllHarvests()).slice().sort((a, b) => a.date.localeCompare(b.date));
    return csvResponse('harvests', toCsv(['id','date','olives_kg','oil_kg','tanake','yield_pct','notes'],
      rows3.map((h) => [h.id, h.date, h.olives_kg, h.oil_kg, h.tanake, h.yield_pct, h.notes])));
  }
  if (f === 'oil.csv') {
    var rows4 = (await fetchAllOil()).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    var m = await harvestPageIdToIntMap();
    return csvResponse('oil', toCsv(['id','date','kind','amount_kg','notes','harvest_id'],
      rows4.map((mv) => [mv.id, mv.date, mv.kind, mv.amount_kg, mv.notes, mv._harvestPageId ? (m.get(mv._harvestPageId) || '') : ''])));
  }
  if (f === 'tasks.csv') {
    var rows5 = await fetchAllTasks();
    return csvResponse('tasks', toCsv(['id','name','start_month','end_month','notes'],
      rows5.map((t) => [t.id, t.name, t.start_month, t.end_month, t.notes])));
  }
  if (f === 'all.json') {
    var trees = (await fetchAllTrees());
    var acts = await fetchAllActivities();
    var harvs = (await fetchAllHarvests()).slice().sort((a, b) => a.date.localeCompare(b.date));
    var oils = (await fetchAllOil()).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    var m2 = await harvestPageIdToIntMap();
    var tsks = await fetchAllTasks();
    return json(200, {
      exported_at: new Date().toISOString(),
      trees: trees.map(strip),
      activities: acts.map((a) => ({ id: a.id, date: a.date, type: a.type, trees: a.trees.map((t) => t.label).join('; '), notes: a.notes })),
      harvests: harvs.map(strip),
      oil_movements: oils.map((mv) => ({ id: mv.id, date: mv.date, kind: mv.kind, amount_kg: mv.amount_kg, notes: mv.notes, harvest_id: mv._harvestPageId ? (m2.get(mv._harvestPageId) || null) : null })),
      seasonal_tasks: tsks.map(strip)
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
    if (head === 'dashboard' && method === 'GET') return await handleDashboard();
    if (head === 'export' && method === 'GET') return await handleExport(parts);
    if (head === 'auth') return await handleAuth(method, parts, event);
    return json(404, { detail: 'not found' });
  } catch (err) {
    return json(500, { detail: String((err && err.message) || err) });
  }
};
