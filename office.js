const I18N = {
  tr: {
    demo: "Demo", live: "Canlı OpenMaus", send: "Gönder", stop: "Durdur",
    roster: "Kadro", feed: "İş akışı", war: "TOPLANTI · ADA",
    approvals: "ONAY", approvalHint: "Kartlar harness’ten gelir. Allow bir kez · Always kalıcı izin yazar.",
    phMsg: "Bu ajana mesaj", phDock: "Seçili ajana mesaj yaz",
    empty: "boş koltuk", noTarget: "hedef yok", bot: "Bot", channel: "Kanal",
    sent: "Gönderildi", stopped: "Durduruldu", needText: "Metin yaz.",
    noAgent: "Bu koltukta ajan yok.", liveNeed: "Canlı mod ve köprü gerekir.",
    allow: "Allow", deny: "Deny", always: "Always",
    noPending: "Bekleyen onay yok.",
    banner: "Her ajanın kendi Gönder / Durdur tuşu var. 127.0.0.1 only.",
  },
  en: {
    demo: "Demo", live: "Live OpenMaus", send: "Send", stop: "Stop",
    roster: "Team", feed: "Activity", war: "MEETING · ADA",
    approvals: "APPROVALS", approvalHint: "Cards come from the harness. Allow once · Always writes a grant.",
    phMsg: "Message this agent", phDock: "Message the selected agent",
    empty: "empty seat", noTarget: "no target", bot: "Bot", channel: "Channel",
    sent: "Sent", stopped: "Stopped", needText: "Write a message.",
    noAgent: "No agent on this seat.", liveNeed: "Live mode and the bridge are required.",
    allow: "Allow", deny: "Deny", always: "Always",
    noPending: "No pending approvals.",
    banner: "Each agent has its own Send / Stop. 127.0.0.1 only.",
  }
};
let lang = localStorage.getItem("maus-lang") || "tr";
function t(key) { return (I18N[lang] || I18N.tr)[key] || key; }
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  document.querySelectorAll("[data-lang]").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
  document.querySelectorAll("[data-i]").forEach((el) => { el.textContent = t(el.dataset.i); });
  document.querySelectorAll("[data-i-ph]").forEach((el) => { el.placeholder = t(el.dataset.iPh); });
  const banner = document.getElementById("banner");
  if (banner) banner.textContent = t("banner");
}
const LINES = [
  ["kenan", "kaynak okuyor", "araştırıyor"],
  ["mira", "değişiklik yazıyor", "geliştirme"],
  ["leyla", "işi kapatıyor", "operasyon"],
  ["deniz", "metin sadeleştiriyor", "iletişim"],
  ["riza", "yetki kontrolü", "uyum"],
  ["ada", "toplantı dağıtımı", "koordinasyon"],
];
const FEED = [
  "Ada → Kenan: rakip sayfasını kaynakla ve özetle.",
  "Kenan: 3 kaynak, 1 spekülasyon. Spekülasyon çıkarıldı.",
  "Rıza: dış ileti için onay yok. Beklemede.",
  "Mira: 24 satırlık yama. Testler geçti.",
  "Leyla: OF-17 işi kapatıldı.",
  "Deniz: taslak hazır, onay sende.",
  "Ada: esnek masa boş. Yeni kişi yok.",
];
const feedEl = document.getElementById("feed");
const started = Date.now();
let mode = "demo";
let i = 0;
let lastSig = "";
let liveTimer = null;
let lastFloor = null;
function log(text) {
  const d = document.createElement("div");
  const stamp = new Date().toTimeString().slice(0,8);
  d.innerHTML = `<time>${stamp}</time>${text}`;
  feedEl.prepend(d);
  while (feedEl.children.length > 40) feedEl.lastChild.remove();
}
function setSeat(who, text, status, busy) {
  const bubble = document.getElementById("b-" + who);
  const st = document.getElementById("st-" + who);
  const worker = document.getElementById("w-" + who);
  if (bubble && text) bubble.textContent = text;
  if (st && status) st.textContent = status;
  if (worker) {
    worker.style.opacity = busy === false ? 0.55 : 1;
    if (who !== "ada") {
      worker.classList.toggle("sit", true);
      worker.classList.toggle("walk", Boolean(busy));
      worker.style.filter = busy ? "drop-shadow(0 6px 0 #0006) saturate(1.2)" : "drop-shadow(0 6px 0 #0006) grayscale(.15)";
    }
  }
}
function tickAnim() {
  if (mode === "live") return;
  const [who, say, st] = LINES[i % LINES.length];
  setSeat(who, say, st, true);
  log(say[0].toUpperCase() + say.slice(1) + " — " + who);
  i++;
}
function walkAda() {
  const ada = document.getElementById("w-ada");
  const spots = [["50%","58%"],["32%","48%"],["68%","48%"],["50%","36%"]];
  let s = 0;
  setInterval(() => {
    s = (s + 1) % spots.length;
    ada.style.left = spots[s][0];
    ada.style.top = spots[s][1];
    ada.style.transition = "left 1.6s linear, top 1.6s linear";
  }, 2800);
}
function uptime() {
  const el = document.getElementById("uptimeChip");
  setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    el.textContent = `UP ${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  }, 1000);
}
function applyFloor(data) {
  const chip = document.getElementById("healthChip");
  const stats = document.getElementById("stats");
  const banner = document.getElementById("banner");
  if (!data || data.ok === false && data.source === "none") {
    chip.textContent = "OFFLINE · DEMO";
    chip.className = "chip warn";
    log(data?.error || "Canlı kadro yok.");
    return;
  }
  const label = data.source === "harness" ? "CANLI HARNESS" : data.source === "disk" ? "CANLI DİSK" : "CANLI";
  chip.textContent = `${label} · ${data.counts?.bots || 0} people`;
  chip.className = "chip on";
  const seats = data.seats || {};
  for (const key of ["ada","kenan","mira","riza","leyla","deniz"]) {
    const bot = seats[key];
    if (!bot) { setSeat(key, "koltuk boş", "yok", false); continue; }
    setSeat(key, bot.line, bot.busy ? "tur" : (bot.task || "idle"), bot.busy);
  }
  const extras = data.extras || [];
  const spawn = extras[0];
  document.getElementById("st-spawn").textContent = spawn ? spawn.name : "flex empty";
  lastFloor = data;
  bindSeats(data);
  renderRoster(data);
  fillTargets(data.targets || []);
  renderCards(data.pending || []);
  stats.innerHTML = `Bot: <b>${data.counts.bots}</b><br>Meşgul: <b>${data.counts.busy}</b><br>Onay: <b>${(data.pending||[]).length}</b>`;
  banner.textContent = data.origin ? `Kaynak ${data.origin} (${data.source})` : `Kaynak ~/.openmausbot/bots.json (${data.source})`;
  const sig = (data.activity || []).map(a => a.id + a.status + a.task).join("|");
  if (sig !== lastSig) {
    lastSig = sig;
    (data.activity || []).slice(0, 8).forEach(a => log(a.line));
  }
}
async function pullLive() {
  try {
    const res = await fetch("/api/floor", { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(res.status);
    applyFloor(await res.json());
  } catch {
    document.getElementById("healthChip").textContent = "BRIDGE OFF · DEMO";
    document.getElementById("healthChip").className = "chip warn";
    log("bridge.mjs çalışmıyor. node bridge.mjs → http://127.0.0.1:8765");
  }
}
function setMode(next) {
  mode = next;
  document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === next));
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  if (next === "live") {
    pullLive();
    liveTimer = setInterval(pullLive, 2500);
  } else {
    document.getElementById("healthChip").textContent = "OFFICE · DEMO";
    document.getElementById("healthChip").className = "chip on";
  }
}
document.querySelectorAll("[data-mode]").forEach(btn => { btn.onclick = () => setMode(btn.dataset.mode); });
document.querySelectorAll("[data-lang]").forEach((btn) => {
  btn.onclick = () => { lang = btn.dataset.lang; localStorage.setItem("maus-lang", lang); applyLang(); if (lastFloor) renderRoster(lastFloor); };
});
function seatBot(seat) {
  if (!lastFloor) return null;
  if (seat === "spawn") return (lastFloor.extras || [])[0] || null;
  return (lastFloor.seats || {})[seat] || null;
}
function bindSeats(data) {
  const map = { ...(data.seats || {}), spawn: (data.extras || [])[0] || null };
  document.querySelectorAll("[data-seat]").forEach((desk) => {
    const bot = map[desk.dataset.seat];
    desk.dataset.botId = bot?.id || "";
    desk.dataset.threadId = bot?.threadId || "";
    desk.style.opacity = bot ? "1" : "0.72";
  });
}
function renderRoster(data) {
  const box = document.getElementById("roster");
  const rows = ["ada","kenan","mira","riza","leyla","deniz"].map((key) => ({ key, bot: (data.seats || {})[key] }));
  (data.extras || []).forEach((bot) => rows.push({ key: "spawn", bot }));
  box.innerHTML = rows.map(({ key, bot }) => {
    const name = bot?.name || key;
    const title = bot?.title || (bot ? (bot.busy ? "busy / meşgul" : "idle") : t("empty"));
    const disabled = bot?.id ? "" : "disabled";
    const colors = {ada:'#e6c36a',kenan:'#7dffc3',mira:'#7ecbff',riza:'#ff7a9a',leyla:'#c9a6ff',deniz:'#ffb25a',spawn:'#e6c36a'};
    return `<div class="emp"><i class="swatch" style="background:${colors[key]}"></i><div><b>${esc(name)}</b><span>${esc(title)}</span></div><div class="emp-actions"><button class="allow" ${disabled} data-roster-send="${key}" data-i="send">${t("send")}</button><button class="deny" ${disabled} data-roster-stop="${key}" data-i="stop">${t("stop")}</button></div></div>`;
  }).join("");
  box.querySelectorAll("[data-roster-send]").forEach((b) => {
    b.onclick = () => sendToAgent(b.dataset.rosterSend, document.querySelector(`[data-seat-input="${b.dataset.rosterSend}"]`)?.value || document.getElementById("composer").value);
  });
  box.querySelectorAll("[data-roster-stop]").forEach((b) => { b.onclick = () => stopAgent(b.dataset.rosterStop); });
}
async function sendToAgent(seat, text) {
  const bot = seatBot(seat);
  const msg = (text || "").trim();
  if (!msg) { log(t("needText")); return; }
  if (mode !== "live") { log(t("liveNeed")); return; }
  if (!bot?.id) { log(t("noAgent")); return; }
  try {
    await postJson("/api/send", { kind: "bot", id: bot.id, threadId: bot.threadId, text: msg });
    const inp = document.querySelector(`[data-seat-input="${seat}"]`);
    if (inp) inp.value = "";
    log(`${t("sent")} → ${bot.name}: ${msg.slice(0,80)}`);
    setTimeout(pullLive, 400);
  } catch (err) { log(`${t("sent")} X: ${err.message}`); }
}
async function stopAgent(seat) {
  const bot = seatBot(seat);
  if (mode !== "live") { log(t("liveNeed")); return; }
  if (!bot?.id) { log(t("noAgent")); return; }
  try {
    await postJson("/api/interrupt", { botId: bot.id });
    log(`${t("stopped")}: ${bot.name}`);
    setTimeout(pullLive, 400);
  } catch (err) { log(`${t("stopped")} X: ${err.message}`); }
}
document.querySelectorAll("[data-seat-send]").forEach((btn) => {
  btn.onclick = () => sendToAgent(btn.dataset.seatSend, document.querySelector(`[data-seat-input="${btn.dataset.seatSend}"]`)?.value);
});
document.querySelectorAll("[data-seat-stop]").forEach((btn) => {
  btn.onclick = () => stopAgent(btn.dataset.seatStop);
});
document.querySelectorAll("[data-seat-input]").forEach((inp) => {
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") sendToAgent(inp.dataset.seatInput, inp.value); });
});
applyLang();
renderRoster({ seats: {}, extras: [] });
FEED.forEach(log);
setInterval(tickAnim, 3200);
walkAda();
uptime();
tickAnim();
renderCards([{ botId: "demo", botName: "Rıza", threadId: "", requestId: "demo", title: "Demo kart: dışarı mail", subtitle: "Canlı modda gerçek Allow/Deny buraya düşer", tool: "send_email", allowKey: "", options: ["Allow","Deny"] }]);
function fillTargets(targets) {
  const sel = document.getElementById("target");
  const prev = sel.value;
  sel.innerHTML = "";
  if (!targets.length) { sel.innerHTML = `<option value="">hedef yok</option>`; return; }
  for (const target of targets) {
    const opt = document.createElement("option");
    opt.value = `${target.kind}:${target.id}:${target.threadId || ""}`;
    opt.textContent = `${target.kind === "group" ? I18N[lang].channel : I18N[lang].bot} · ${target.name}`;
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}
function renderCards(pending) {
  const box = document.getElementById("cards");
  box.innerHTML = "";
  if (!pending.length) {
    box.innerHTML = `<div class="sub" style="color:var(--mute);padding:8px">${t("noPending")}</div>`;
    return;
  }
  for (const card of pending) {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<b>${esc(card.botName)} · ${esc(card.title)}</b><div class="sub">${esc(card.subtitle || card.tool || card.requestId)}</div><div class="row"><button class="allow" data-act="allow">Allow</button><button class="deny" data-act="deny">Deny</button>${card.allowKey ? `<button class="always" data-act="always">Always</button>` : ""}</div>`;
    el.querySelectorAll("button").forEach((btn) => { btn.onclick = () => decideCard(card, btn.dataset.act); });
    box.appendChild(el);
  }
}
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&","<":"<",">":">","\"":""","'":"&#39;" }[c]));
}
async function postJson(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || res.status);
  return data;
}
async function sendNow() {
  const raw = document.getElementById("target").value;
  const text = document.getElementById("composer").value.trim();
  if (!raw || !text) { log("Hedef ve metin lazım."); return; }
  const [kind, id, threadId] = raw.split(":");
  try {
    await postJson("/api/send", { kind, id, threadId, text });
    document.getElementById("composer").value = "";
    log(`Gönderildi → ${kind} ${id}: ${text.slice(0, 80)}`);
    setTimeout(pullLive, 400);
  } catch (err) { log("Gönderilemedi: " + err.message); }
}
async function stopNow() {
  const raw = document.getElementById("target").value;
  if (!raw) return;
  const [kind, id] = raw.split(":");
  if (kind !== "bot") { log("Kes sadece bot hedefinde."); return; }
  try {
    await postJson("/api/interrupt", { botId: id });
    log("Kesildi: " + id);
    setTimeout(pullLive, 400);
  } catch (err) { log("Kesilemedi: " + err.message); }
}
async function decideCard(card, act) {
  const behavior = act === "deny" ? "deny" : "allow";
  try {
    await postJson("/api/decide", { botId: card.botId, threadId: card.threadId, requestId: card.requestId, behavior, always: act === "always", allowKey: card.allowKey || "" });
    log(`${act.toUpperCase()} · ${card.botName} · ${card.title}`);
    setTimeout(pullLive, 400);
  } catch (err) { log("Onay gitmedi: " + err.message); }
}
document.getElementById("sendBtn").onclick = sendNow;
document.getElementById("stopBtn").onclick = stopNow;
document.getElementById("composer").addEventListener("keydown", (e) => { if (e.key === "Enter") sendNow(); });
if (location.port === "8765") setMode("live");
