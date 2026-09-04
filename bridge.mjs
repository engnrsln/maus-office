#!/usr/bin/env node
/**
 * Maus Office bridge
 * Loopback-only. Reads OpenMaus harness GET /api/bots (+ instances).
 * Falls back to ~/.openmausbot/bots.json. Never reads config.json keys.
 * Send + approve are explicit POST routes on this bridge only.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MAUS_OFFICE_PORT || 8765);
const DATA_DIR = process.env.OMB_DATA_DIR || path.join(os.homedir(), ".openmausbot");
const CANDIDATES = [
  process.env.OPENMAUSBOT_URL,
  "http://127.0.0.1:8799",
  "http://127.0.0.1:18799",
  "http://127.0.0.1:28799",
].filter(Boolean);

const SEATS = [
  { key: "ada", aliases: ["ada", "chief", "cos", "chief of staff"], role: "Chief of Staff" },
  { key: "kenan", aliases: ["kenan", "research", "scout"], role: "Research" },
  { key: "mira", aliases: ["mira", "engineering", "engineer", "dev"], role: "Engineering" },
  { key: "riza", aliases: ["riza", "rıza", "risk"], role: "Risk" },
  { key: "leyla", aliases: ["leyla", "ops", "operations"], role: "Operations" },
  { key: "deniz", aliases: ["deniz", "comms", "communications"], role: "Communications" },
];

function norm(s) {
  return String(s || "")
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim();
}

function seatFor(bot) {
  const blob = norm([bot.name, bot.title, bot.key].filter(Boolean).join(" "));
  for (const seat of SEATS) {
    if (seat.aliases.some((a) => blob.includes(a))) return seat.key;
  }
  return null;
}

function isId(v) {
  return typeof v === "string" && /^[\w-]+$/.test(v) && v.length <= 80;
}

async function harnessFetch(origin, pathname, options = {}) {
  const url = `${origin.replace(/\/$/, "")}${pathname}`;
  const host = new URL(origin).host;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options.timeoutMs || 4000);
  try {
    const headers = {
      Host: host,
      Accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
    };
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
    if (!res.ok) {
      const err = new Error(json?.error || `${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(origin, pathname) {
  return harnessFetch(origin, pathname);
}

function messageList(container) {
  if (!container) return [];
  if (Array.isArray(container.messages)) return container.messages;
  if (Array.isArray(container.items)) return container.items;
  if (Array.isArray(container)) return container;
  return [];
}

function pendingFrom(owner, threadId, messages) {
  const out = [];
  for (const msg of messages) {
    const card = msg.card || msg.options || null;
    const requestId = card?.requestId || msg.requestId;
    if (!requestId) continue;
    if (msg.kind && msg.kind !== "options") continue;
    if (card?.answered || card?.dismissed || msg.answered || msg.dismissed) continue;
    out.push({
      botId: owner.id,
      botName: owner.name,
      threadId: threadId || owner.threadId || "",
      requestId: String(requestId),
      title: card?.title || msg.text || "Onay",
      subtitle: card?.subtitle || card?.tool || "",
      tool: card?.tool || "",
      allowKey: card?.allowKey || "",
      options: Array.isArray(card?.options) ? card.options : ["Allow", "Deny"],
      held: card?.held || "",
    });
  }
  return out;
}

async function findOrigin() {
  for (const origin of CANDIDATES) {
    try {
      const env = await fetchJson(origin, "/.well-known/openmausbot/environment");
      if (env && (env.environmentId || env.version || env.label || env.name === "OpenMausBot")) {
        return { origin, env };
      }
    } catch {
      /* next */
    }
  }
  return { origin: null, env: null };
}

function readDiskBots() {
  const file = path.join(DATA_DIR, "bots.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(raw) ? raw : raw.bots || raw.items || [];
    return list.map(slimBot);
  } catch {
    return [];
  }
}

function slimBot(bot) {
  const tasks = Array.isArray(bot.tasks) ? bot.tasks : [];
  const active = tasks.find((t) => t.threadId === bot.threadId) || tasks[0];
  return {
    id: bot.id || bot.botId || "",
    name: bot.name || "Bot",
    title: bot.title || "",
    model: bot.model || bot.engine || bot.provider || "",
    hidden: Boolean(bot.hidden),
    task: active?.title || bot.threadTitle || "",
    threadId: bot.threadId || active?.threadId || "",
    color: bot.color || bot.appearance?.color || "",
  };
}

function instanceBusyMap(instances) {
  const map = new Map();
  const list = Array.isArray(instances)
    ? instances
    : instances?.items || instances?.instances || [];
  for (const inst of list) {
    const id = inst.botId || inst.id || inst.bot_id;
    if (!id) continue;
    const busy =
      inst.busy === true ||
      inst.status === "running" ||
      inst.status === "busy" ||
      inst.state === "running" ||
      Boolean(inst.activeTurn || inst.turn);
    map.set(id, { busy, status: inst.status || inst.state || (busy ? "busy" : "idle") });
  }
  return map;
}

function decorate(bot, busyMap) {
  const live = busyMap.get(bot.id) || {};
  return {
    ...bot,
    busy: Boolean(live.busy),
    status: live.status || (bot.task ? "task" : "idle"),
    line: lineFor(bot, live.busy),
  };
}

function lineFor(bot, busy) {
  if (busy && bot.task) return `${bot.name}: ${bot.task}`;
  if (busy) return `${bot.name} tur atıyor`;
  if (bot.task) return `${bot.name} · ${bot.task}`;
  return `${bot.name} bekliyor`;
}

function buildFloor(bots, busyMap, meta) {
  const visible = bots.filter((b) => !b.hidden);
  const used = new Set();
  const seats = {};
  for (const seat of SEATS) seats[seat.key] = null;

  for (const bot of visible) {
    const key = seatFor(bot);
    if (key && !seats[key]) {
      seats[key] = decorate(bot, busyMap);
      used.add(bot.id);
    }
  }

  const extras = visible.filter((b) => !used.has(b.id)).map((b) => decorate(b, busyMap));
  const activity = visible.map((b) => decorate(b, busyMap));
  const busyCount = activity.filter((b) => b.busy).length;

  return {
    ok: true,
    source: meta.source,
    origin: meta.origin,
    env: meta.env,
    generatedAt: Date.now(),
    counts: { bots: visible.length, busy: busyCount, extras: extras.length },
    seats,
    extras,
    activity,
  };
}

async function snapshot() {
  const found = await findOrigin();
  let bots = [];
  let busyMap = new Map();
  let source = "disk";
  let pending = [];
  let groups = [];
  let rawBots = [];

  if (found.origin) {
    try {
      const payload = await fetchJson(found.origin, "/api/bots?messages=30");
      rawBots = Array.isArray(payload) ? payload : payload.bots || payload.items || [];
      groups = payload?.groups || [];
      bots = rawBots.map(slimBot);
      source = "harness";
      for (const bot of rawBots) {
        pending.push(...pendingFrom(slimBot(bot), bot.threadId, messageList(bot)));
      }
      for (const g of groups) {
        pending.push(...pendingFrom({ id: g.id, name: g.name || "Kanal", threadId: g.threadId }, g.threadId, messageList(g)));
      }
    } catch {
      bots = readDiskBots();
      source = found.origin ? "disk-fallback" : "disk";
    }
    try {
      const inst = await fetchJson(found.origin, "/api/instances");
      busyMap = instanceBusyMap(inst);
    } catch {
      busyMap = new Map();
    }
  } else {
    bots = readDiskBots();
    source = bots.length ? "disk" : "none";
  }

  if (!bots.length && source === "none") {
    return {
      ok: false,
      source: "none",
      origin: found.origin,
      env: found.env,
      generatedAt: Date.now(),
      error: "OpenMaus harness yok, ~/.openmausbot/bots.json de boş.",
      seats: Object.fromEntries(SEATS.map((s) => [s.key, null])),
      extras: [],
      activity: [],
      pending: [],
      targets: [],
      groups: [],
      counts: { bots: 0, busy: 0, extras: 0 },
    };
  }

  const floor = buildFloor(bots, busyMap, { source, origin: found.origin, env: found.env });
  floor.pending = pending;
  floor.groups = groups.map((g) => ({
    id: g.id,
    name: g.name || "Kanal",
    threadId: g.threadId || "",
  }));
  floor.targets = [
    ...floor.activity.map((b) => ({ kind: "bot", id: b.id, name: b.name, threadId: b.threadId })),
    ...floor.groups.map((g) => ({ kind: "group", id: g.id, name: g.name, threadId: g.threadId })),
  ];
  return floor;
}

async function requireOrigin() {
  const found = await findOrigin();
  if (!found.origin) {
    const err = new Error("OpenMaus harness yok");
    err.status = 503;
    throw err;
  }
  return found.origin;
}

async function sendWork(body) {
  const origin = await requireOrigin();
  const text = String(body?.text || "").trim();
  if (!text) throw Object.assign(new Error("text required"), { status: 400 });
  if (text.length > 8000) throw Object.assign(new Error("text too long"), { status: 400 });
  const kind = body.kind === "group" ? "group" : "bot";
  const id = body.id;
  if (!isId(id)) throw Object.assign(new Error("bad id"), { status: 400 });
  const payload = { text };
  if (body.threadId && isId(body.threadId)) payload.threadId = body.threadId;
  const path = kind === "group" ? `/api/groups/${id}/messages` : `/api/bots/${id}/messages`;
  const result = await harnessFetch(origin, path, { method: "POST", body: payload });
  return { ok: true, kind, id, result };
}

async function decide(body) {
  const origin = await requireOrigin();
  const botId = body.botId;
  const requestId = body.requestId;
  const behavior = body.behavior;
  if (!isId(botId) || !isId(String(requestId))) {
    throw Object.assign(new Error("bad ids"), { status: 400 });
  }
  if (!["allow", "deny", "answer"].includes(behavior)) {
    throw Object.assign(new Error("behavior must be allow, deny, or answer"), { status: 400 });
  }
  const payload = { requestId: String(requestId), behavior };
  if (behavior === "deny") payload.message = String(body.message || "Denied from Maus Office.");
  if (behavior === "answer" && body.message) payload.message = String(body.message);
  if (body.always && body.allowKey) {
    payload.alwaysAllow = { botId, key: String(body.allowKey).slice(0, 200) };
  }
  try {
    const result = await harnessFetch(origin, `/api/bots/${botId}/respond`, { method: "POST", body: payload });
    if (body.always && body.allowKey) {
      try {
        await harnessFetch(origin, `/api/bots/${botId}/always-allow`, {
          method: "POST",
          body: { key: String(body.allowKey).slice(0, 200) },
        });
      } catch {
        /* respond may already have recorded the grant */
      }
    }
    return { ok: true, result };
  } catch (err) {
    if (body.threadId && isId(body.threadId)) {
      const result = await harnessFetch(origin, `/api/threads/${body.threadId}/respond`, { method: "POST", body: payload });
      return { ok: true, result, via: "thread" };
    }
    throw err;
  }
}

async function interruptBot(body) {
  const origin = await requireOrigin();
  if (!isId(body.botId)) throw Object.assign(new Error("bad id"), { status: 400 });
  const result = await harnessFetch(origin, `/api/bots/${body.botId}/interrupt`, { method: "POST", body: {} });
  return { ok: true, result };
}

function readReq(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > 20000) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8") || "{}"));
    req.on("error", reject);
  });
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/send") {
    try {
      const body = JSON.parse(await readReq(req));
      const out = await sendWork(body);
      res.writeHead(202, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
    } catch (err) {
      res.writeHead(err.status || 500, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/decide") {
    try {
      const body = JSON.parse(await readReq(req));
      const out = await decide(body);
      res.writeHead(200, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
    } catch (err) {
      res.writeHead(err.status || 500, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/interrupt") {
    try {
      const body = JSON.parse(await readReq(req));
      const out = await interruptBot(body);
      res.writeHead(200, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
    } catch (err) {
      res.writeHead(err.status || 500, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/floor" || url.pathname === "/api/health") {
    try {
      const body = await snapshot();
      res.writeHead(200, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    } catch (err) {
      res.writeHead(500, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }

  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.normalize(path.join(__dirname, rel));
  if (!file.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("no");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Maus Office  http://127.0.0.1:${PORT}`);
  console.log("Live floor    GET /api/floor");
  console.log("Harness try   8799 / 18799 / 28799  then", DATA_DIR);
});
