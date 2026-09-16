// Thin Notion API 2025-09-03 client + property builders/parsers + int-id
// bridge. Every response the frontend sees uses the original SQLite int id,
// preserved via a `[sqlite:{table}#{n}]` marker embedded at the end of Notes.
// New rows get id = max(existing) + 1 (per data source).

const API = "https://api.notion.com/v1";

function headers(): Record<string, string> {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error("NOTION_API_KEY not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2025-09-03",
    "Content-Type": "application/json",
  };
}

export async function notionFetch(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Notion ${method} ${path} -> ${res.status}: ${t.slice(0, 500)}`);
  }
  return res.json();
}

export const DS = {
  trees: () => process.env.NOTION_DS_TREES!,
  activities: () => process.env.NOTION_DS_ACTIVITIES!,
  harvests: () => process.env.NOTION_DS_HARVESTS!,
  oil: () => process.env.NOTION_DS_OIL!,
  tasks: () => process.env.NOTION_DS_TASKS!,
};

export const DB = {
  trees: () => process.env.NOTION_DB_TREES!,
  activities: () => process.env.NOTION_DB_ACTIVITIES!,
  harvests: () => process.env.NOTION_DB_HARVESTS!,
  oil: () => process.env.NOTION_DB_OIL!,
  tasks: () => process.env.NOTION_DB_TASKS!,
};

export type Table = "trees" | "activities" | "harvests" | "oil_movements" | "seasonal_tasks";

const MARKER = /\[sqlite:(\w+)#(\d+)\]/;

export function parseMarker(notesRich: any[]): { table: string; id: number } | null {
  const text = (notesRich || []).map((t: any) => t.plain_text ?? "").join("");
  const m = text.match(MARKER);
  if (!m) return null;
  return { table: m[1], id: parseInt(m[2], 10) };
}

export function notesPlain(notesRich: any[]): string {
  // Strip the trailing marker plus any preceding blank lines.
  const raw = (notesRich || []).map((t: any) => t.plain_text ?? "").join("");
  return raw.replace(/\n*\[sqlite:\w+#\d+\]\s*$/, "").replace(/\s+$/, "");
}

export function richWithMarker(notes: string, table: Table, id: number): any[] {
  const marker = `[sqlite:${table}#${id}]`;
  const combined = notes ? `${notes}\n\n${marker}` : marker;
  return [{ type: "text", text: { content: combined.slice(0, 1900) } }];
}

export function richText(text: string | null | undefined): any[] {
  if (!text) return [];
  return [{ type: "text", text: { content: String(text).slice(0, 1900) } }];
}

export async function queryAll(dsId: string, filter?: any, sorts?: any[]): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  while (true) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    const r = await notionFetch("POST", `/data_sources/${dsId}/query`, body);
    for (const p of r.results ?? []) results.push(p);
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return results;
}

// -------------------- int-id <-> notion uuid cache --------------------
// Per data source: {int_id -> notion_page_id}. TTL 30s.

type CacheEntry = { at: number; map: Map<number, string>; maxId: number };
const cache = new Map<Table, CacheEntry>();
const TTL_MS = 30_000;

const TABLE_TO_DS: Record<Table, () => string> = {
  trees: DS.trees,
  activities: DS.activities,
  harvests: DS.harvests,
  oil_movements: DS.oil,
  seasonal_tasks: DS.tasks,
};

export async function refreshIndex(table: Table): Promise<CacheEntry> {
  const dsId = TABLE_TO_DS[table]();
  const pages = await queryAll(dsId);
  const map = new Map<number, string>();
  let maxId = 0;
  for (const p of pages) {
    const notesProp = p.properties?.Notes;
    const rich = notesProp?.rich_text ?? [];
    const marker = parseMarker(rich);
    if (marker && marker.table === table) {
      map.set(marker.id, p.id);
      if (marker.id > maxId) maxId = marker.id;
    }
  }
  const entry = { at: Date.now(), map, maxId };
  cache.set(table, entry);
  return entry;
}

export async function getIndex(table: Table, force = false): Promise<CacheEntry> {
  const hit = cache.get(table);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit;
  return refreshIndex(table);
}

export async function nextId(table: Table): Promise<number> {
  const idx = await getIndex(table, true);
  return idx.maxId + 1;
}

export async function pageIdForInt(table: Table, intId: number): Promise<string | null> {
  let idx = await getIndex(table);
  let pid = idx.map.get(intId);
  if (pid) return pid;
  idx = await refreshIndex(table);
  return idx.map.get(intId) ?? null;
}

export async function intIdForPageId(table: Table, pageId: string): Promise<number | null> {
  const idx = await getIndex(table);
  for (const [k, v] of idx.map.entries()) if (v === pageId) return k;
  const idx2 = await refreshIndex(table);
  for (const [k, v] of idx2.map.entries()) if (v === pageId) return k;
  return null;
}

export function invalidateCache(table?: Table) {
  if (table) cache.delete(table);
  else cache.clear();
}

// -------------------- Property helpers --------------------
export function numProp(p: any): number | null {
  return p?.number ?? null;
}
export function selectName(p: any): string {
  return p?.select?.name ?? "";
}
export function dateStart(p: any): string {
  return p?.date?.start ?? "";
}
export function titlePlain(p: any): string {
  return (p?.title ?? []).map((t: any) => t.plain_text ?? "").join("");
}
export function relationIds(p: any): string[] {
  return (p?.relation ?? []).map((r: any) => r.id);
}
export function formulaNumber(p: any): number | null {
  return p?.formula?.number ?? null;
}

// -------------------- Row builders/parsers --------------------

// Trees
export function treeToOut(page: any) {
  const props = page.properties ?? {};
  const marker = parseMarker(props.Notes?.rich_text ?? []);
  return {
    id: marker?.id ?? 0,
    label: titlePlain(props.Label),
    row: numProp(props.Row) ?? 0,
    col: numProp(props.Col) ?? 0,
    variety: selectName(props.Variety),
    planted_year: numProp(props["Planted year"]),
    status: selectName(props.Status) || "active",
    notes: notesPlain(props.Notes?.rich_text ?? []),
    _pageId: page.id,
  };
}
export function treeProps(data: any, id: number) {
  const p: any = {
    Label: { title: richText(data.label) },
    Row: { number: data.row ?? 0 },
    Col: { number: data.col ?? 0 },
    Notes: { rich_text: richWithMarker(data.notes ?? "", "trees", id) },
  };
  if (data.variety) p.Variety = { select: { name: data.variety } };
  else p.Variety = { select: null };
  if (data.planted_year !== null && data.planted_year !== undefined)
    p["Planted year"] = { number: data.planted_year };
  else p["Planted year"] = { number: null };
  p.Status = { select: { name: data.status || "active" } };
  return p;
}

// Harvests
export function harvestToOut(page: any) {
  const props = page.properties ?? {};
  const marker = parseMarker(props.Notes?.rich_text ?? []);
  const olives = numProp(props["Olives kg"]) ?? 0;
  const oil = numProp(props["Oil kg"]) ?? 0;
  return {
    id: marker?.id ?? 0,
    date: dateStart(props.Date),
    olives_kg: olives,
    oil_kg: oil,
    tanake: numProp(props.Tanake),
    notes: notesPlain(props.Notes?.rich_text ?? []),
    yield_pct: olives > 0 ? Math.round((oil / olives) * 1000) / 10 : null,
    _pageId: page.id,
  };
}
export function harvestProps(data: any, id: number) {
  const p: any = {
    Name: { title: richText(`Harvest — ${data.date}`) },
    Date: { date: { start: data.date } },
    "Olives kg": { number: data.olives_kg },
    "Oil kg": { number: data.oil_kg },
    Notes: { rich_text: richWithMarker(data.notes ?? "", "harvests", id) },
    Tanake: { number: data.tanake ?? null },
  };
  return p;
}

// Oil movements
export function oilToOut(page: any) {
  const props = page.properties ?? {};
  const marker = parseMarker(props.Notes?.rich_text ?? []);
  const rel = relationIds(props.Harvest);
  return {
    id: marker?.id ?? 0,
    date: dateStart(props.Date),
    kind: selectName(props.Kind),
    amount_kg: numProp(props["Amount kg"]) ?? 0,
    notes: notesPlain(props.Notes?.rich_text ?? []),
    harvest_id: null as number | null,
    _pageId: page.id,
    _harvestPageId: rel[0] ?? null,
  };
}
export function oilProps(data: any, id: number, harvestPageId?: string | null) {
  const p: any = {
    Name: { title: richText(`${data.kind} — ${data.date}`) },
    Date: { date: { start: data.date } },
    Kind: { select: { name: data.kind } },
    "Amount kg": { number: data.amount_kg },
    Notes: { rich_text: richWithMarker(data.notes ?? "", "oil_movements", id) },
  };
  if (harvestPageId) p.Harvest = { relation: [{ id: harvestPageId }] };
  else p.Harvest = { relation: [] };
  return p;
}

// Activities
export function activityToOut(page: any, treeLookup: Map<string, { id: number; label: string }>) {
  const props = page.properties ?? {};
  const marker = parseMarker(props.Notes?.rich_text ?? []);
  const rel = relationIds(props.Trees);
  const trees = rel
    .map((rid) => treeLookup.get(rid))
    .filter((t): t is { id: number; label: string } => Boolean(t));
  return {
    id: marker?.id ?? 0,
    date: dateStart(props.Date),
    type: selectName(props.Type),
    notes: notesPlain(props.Notes?.rich_text ?? []),
    trees,
    _pageId: page.id,
  };
}
export function activityProps(data: any, id: number, treePageIds: string[]) {
  const p: any = {
    Name: { title: richText(`${data.type} — ${data.date}`) },
    Date: { date: { start: data.date } },
    Type: { select: { name: data.type } },
    Notes: { rich_text: richWithMarker(data.notes ?? "", "activities", id) },
    Trees: { relation: treePageIds.map((id) => ({ id })) },
  };
  return p;
}

// Seasonal tasks
export function taskToOut(page: any) {
  const props = page.properties ?? {};
  const marker = parseMarker(props.Notes?.rich_text ?? []);
  return {
    id: marker?.id ?? 0,
    name: titlePlain(props.Name),
    start_month: numProp(props["Start month"]) ?? 1,
    end_month: numProp(props["End month"]) ?? 1,
    notes: notesPlain(props.Notes?.rich_text ?? []),
    _pageId: page.id,
  };
}
export function taskProps(data: any, id: number) {
  return {
    Name: { title: richText(data.name) },
    "Start month": { number: data.start_month },
    "End month": { number: data.end_month },
    Notes: { rich_text: richWithMarker(data.notes ?? "", "seasonal_tasks", id) },
  };
}

// -------------------- CRUD helpers --------------------
export async function createPage(databaseId: string, properties: any): Promise<any> {
  return notionFetch("POST", "/pages", { parent: { database_id: databaseId }, properties });
}
export async function updatePage(pageId: string, properties: any): Promise<any> {
  return notionFetch("PATCH", `/pages/${pageId}`, { properties });
}
export async function archivePage(pageId: string): Promise<any> {
  return notionFetch("PATCH", `/pages/${pageId}`, { archived: true });
}
export async function getPage(pageId: string): Promise<any> {
  return notionFetch("GET", `/pages/${pageId}`);
}
