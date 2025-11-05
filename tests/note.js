/**
 * Load test for carShare HTTP flow with:
 *  - N simulated sessions (avatars)
 *  - Periodic getAllStatuses when idle
 *  - Parallel chats with bidirectional sendLine
 *  - In-chat polling getText at CHAT_POLL_INTERVAL_MS
 *  - Summary metrics (avg, p95) for each action
 *
 * Node 18+ (global fetch).
 */

/* =========================
   CONFIG (TUNE HERE)
   ========================= */
// How many simulated sessions to create:
const SESSIONS = 30;//20

// How many parallel chats to start (uses 2*CHAT_PAIRS avatars):
const CHAT_PAIRS = 12;//8

// In-chat poll interval (ms) for each participant:
const CHAT_POLL_INTERVAL_MS = 2000;

// Idle periodic update timing (ms):
const PERIODIC_UPDATE_BASE_MS = 4000;   // base interval
const PERIODIC_UPDATE_JITTER_MS = 1000; // added 0..JITTER per tick

// Message pacing while chatting (simulated typing latency):
const MESSAGE_JITTER_BASE_MS = 150;
const MESSAGE_JITTER_JITTER_MS = 250;

// Lines each side sends per chat:
const LINES_PER_SIDE = 10;

// HTTP timeout for each request:
const HTTP_TIMEOUT_MS = 10000;

// API base:
const BASE = "https://t8l4i3853e.execute-api.us-east-1.amazonaws.com/V1/";
/* ========================= */

const ADD_AVATAR = BASE + "addAvatar";
const CHAT_START = BASE + "chat/start";
const CHAT_SEND  = BASE + "chat/sendLine";
const CHAT_END   = BASE + "chat/end";
const CHAT_GET   = BASE + "chat/getText";
const GET_ALL    = BASE + "getAllStatuses";

// ---------- small utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nowMs = () => Date.now();

async function httpPost(url, body, {timeoutMs = HTTP_TIMEOUT_MS} = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    if (!res.ok) return { _error: true, status: res.status, ...data };
    return data;
  } finally { clearTimeout(t); }
}

async function httpGet(url, {timeoutMs = HTTP_TIMEOUT_MS} = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", headers: { "Accept": "application/json" }, signal: ctrl.signal });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    if (!res.ok) return { _error: true, status: res.status, ...data };
    return data;
  } finally { clearTimeout(t); }
}

function logSession(id, ...args) {
  console.log(`[S:${id}]`, ...args);
}

// ---------- metrics ----------
function initMetrics() {
  return {
    starts: { ok: 0, errors: 0 },
    lines: { ok: 0, errors: 0 },
    ends: { ok: 0, errors: 0 },
    getTextVerify: { ok: 0, errors: 0 },   // one-off verification call per chat
    status: { ok: 0, errors: 0 },          // idle periodic getAllStatuses
    chatPoll: { ok: 0, errors: 0 },        // in-chat polling getText

    startLatencies: [],
    lineLatencies: [],
    endLatencies: [],
    getTextVerifyLatencies: [],
    statusLatencies: [],
    chatPollLatencies: []
  };
}

function avg(a){return a.length?Math.round(a.reduce((s,x)=>s+x,0)/a.length):0;}
function p95(a){if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length*0.95)-1];}

// ---------- session generation ----------
function genAvatars(count = SESSIONS) {
  const arr = [];
  for (let i = 1; i <= count; i++) {
    const idx = String(i).padStart(2, "0");
    arr.push({
      avatarID: `T${idx}`,
      userName: `test_user_${idx}`,
      isMan: (i % 2 === 0),
      isDriver: i % 3 === 0,
      isPassenger: i % 2 === 1,
      isLoading: false,
      address: `Block ${Math.ceil(i / 2)} St.`,
      day1to: "08:00",
      day1back: "17:00"
    });
  }
  return arr;
}

function buildPairs(avatars, pairsCount = CHAT_PAIRS) {
  const shuffled = avatars.slice().sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(avatars.length, pairsCount * 2));
  const pairs = [];
  for (let i = 0; i + 1 < selected.length; i += 2) {
    pairs.push([selected[i], selected[i + 1]]);
  }
  return pairs;
}

// ---------- periodic updates (idle only) ----------
async function runPeriodicUpdates(avatarID, stopSignal, inChatSet, metrics) {
  let tick = 0;
  while (!stopSignal.stop) {
    // Only poll when NOT in chat
    if (!inChatSet.has(avatarID)) {
      const t0 = nowMs();
      const res = await httpGet(GET_ALL);
      const t1 = nowMs();
      if (res._error) {
        metrics.status.errors++;
        logSession(avatarID, `getAllStatuses ERROR`, res);
      } else {
        metrics.status.ok++;
        metrics.statusLatencies.push(t1 - t0);
        if (tick % 3 === 0) logSession(avatarID, `getAllStatuses ok (#${tick}) +${t1 - t0}ms`);
      }
    }
    tick++;
    const wait = PERIODIC_UPDATE_BASE_MS + Math.random() * PERIODIC_UPDATE_JITTER_MS;
    await sleep(wait);
  }
}

// ---------- in-chat poller (both participants) ----------
async function runChatPoller(chatID, avatarID, stopSignal, metrics) {
  while (!stopSignal.stop) {
    const t0 = nowMs();
    const res = await httpGet(`${CHAT_GET}?chatID=${encodeURIComponent(chatID)}`);
    const t1 = nowMs();
    if (res._error) {
      metrics.chatPoll.errors++;
      logSession(avatarID, `chatPoll getText ERROR`, res);
    } else {
      metrics.chatPoll.ok++;
      metrics.chatPollLatencies.push(t1 - t0);
      // log lightly to keep console readable
      logSession(avatarID, `chatPoll getText ok +${t1 - t0}ms`);
    }
    await sleep(CHAT_POLL_INTERVAL_MS);
  }
}

// ---------- one chat scenario ----------
async function runOneChat(a, b, metrics, inChatSet) {
  const jitter = async () =>
    sleep(MESSAGE_JITTER_BASE_MS + Math.random() * MESSAGE_JITTER_JITTER_MS);

  const fromID = a.avatarID;
  const toID   = b.avatarID;

  const t0 = nowMs();
  logSession(fromID, `chat:start -> ${toID}`);
  const startRes = await httpPost(CHAT_START, {
    fromAvatarID: fromID,
    toAvatarID: toID,
    messageId: `${fromID}-${toID}-${t0}`
  });

  if (startRes._error || !startRes.chatID) {
    logSession(fromID, `chat:start ERROR`, startRes);
    metrics.starts.errors++;
    return;
  }

  const chatID = startRes.chatID;
  const t1 = nowMs();
  metrics.starts.ok++;
  metrics.startLatencies.push(t1 - t0);
  logSession(fromID, `chat:started chatID=${chatID} (+${t1 - t0}ms)`);

  // Mark both avatars as "in chat" so their idle periodic update pauses
  inChatSet.add(a.avatarID);
  inChatSet.add(b.avatarID);

  // Start in-chat pollers for both sides
  const pollStopA = { stop: false };
  const pollStopB = { stop: false };
  const pollers = [
    runChatPoller(chatID, a.avatarID, pollStopA, metrics),
    runChatPoller(chatID, b.avatarID, pollStopB, metrics),
  ];

  // exchange messages (alternating)
  for (let i = 0; i < LINES_PER_SIDE * 2; i++) {
    const sender = (i % 2 === 0) ? a : b;
    const receiver = (sender.avatarID === fromID ? toID : fromID);
    const msg = `${sender.userName}: hi ${i + 1} from ${sender.avatarID}`;

    const ts0 = nowMs();
    const sendRes = await httpPost(CHAT_SEND, {
      chatID,
      fromAvatarID: sender.avatarID,
      toAvatarID: receiver,
      newLine: msg
    });
    const ts1 = nowMs();

    if (sendRes._error) {
      metrics.lines.errors++;
      logSession(sender.avatarID, `sendLine ERROR`, sendRes);
    } else {
      metrics.lines.ok++;
      metrics.lineLatencies.push(ts1 - ts0);
      logSession(sender.avatarID, `sendLine ok (+${ts1 - ts0}ms)`);
    }

    await jitter();
  }

  // One-off verification getText (optional; pollers are already running)
  const gt0 = nowMs();
  const textRes = await httpGet(`${CHAT_GET}?chatID=${encodeURIComponent(chatID)}`);
  const gt1 = nowMs();
  if (textRes._error) {
    metrics.getTextVerify.errors++;
    logSession(fromID, `getText (verify) ERROR`, textRes);
  } else {
    metrics.getTextVerify.ok++;
    metrics.getTextVerifyLatencies.push(gt1 - gt0);
    logSession(fromID, `getText (verify) ok +${gt1 - gt0}ms`);
  }

  // end chat
  const endResult = Math.random() < 0.5 ? "dealDone" : "noDeal";
  const te0 = nowMs();
  const endRes = await httpPost(CHAT_END, {
    chatID,
    fromAvatarID: fromID,
    toAvatarID: toID,
    dealResult: endResult
  });
  const te1 = nowMs();
  if (endRes._error) {
    metrics.ends.errors++;
    logSession(fromID, `chat:end ERROR`, endRes);
  } else {
    metrics.ends.ok++;
    metrics.endLatencies.push(te1 - te0);
    logSession(fromID, `chat:ended (${endResult}) +${te1 - te0}ms`);
  }

  // stop pollers and clear in-chat state
  pollStopA.stop = true;
  pollStopB.stop = true;
  await Promise.allSettled(pollers);
  inChatSet.delete(a.avatarID);
  inChatSet.delete(b.avatarID);
}

// ---------- main ----------
async function main() {
  const avatars = genAvatars(SESSIONS);
  const metrics = initMetrics();
  const inChatSet = new Set();         // tracks who is currently chatting
  const stopAll = { stop: false };     // global stop for periodic updates

  console.log(`=== CREATE ${SESSIONS} AVATARS ===`);
  const createStart = nowMs();
  await Promise.all(avatars.map(async (u) => {
    const res = await httpPost(ADD_AVATAR, u);
    if (res._error) logSession(u.avatarID, "addAvatar ERROR", res);
    else logSession(u.avatarID, "addAvatar ok");
  }));
  console.log(`=== AVATARS READY in ${nowMs() - createStart}ms ===`);

  // start idle periodic updates for all avatars
  const updateLoops = avatars.map(a =>
    runPeriodicUpdates(a.avatarID, stopAll, inChatSet, metrics)
  );

  // build and start chats
  const pairs = buildPairs(avatars, CHAT_PAIRS);
  console.log(`=== START ${pairs.length} PARALLEL CHATS ===`);

  const chatPromises = pairs.map(async ([a, b], i) => {
    // small stagger to reduce thundering herd on /chat/start
    await sleep(i * 200);
    return runOneChat(a, b, metrics, inChatSet);
  });

  await Promise.allSettled(chatPromises);

  // stop idle updates and wait out loops
  stopAll.stop = true;
  await Promise.allSettled(updateLoops);

  // summary
  console.log("\n=== SUMMARY ===");
  const line = (name, ok, err, arr) =>
    console.log(`${name.padEnd(16)} ok=${ok}  err=${err}  avg=${avg(arr)}ms  p95=${p95(arr)}ms`);
  line("Start",            metrics.starts.ok,        metrics.starts.errors,        metrics.startLatencies);
  line("SendLine",         metrics.lines.ok,         metrics.lines.errors,         metrics.lineLatencies);
  line("getText verify",   metrics.getTextVerify.ok, metrics.getTextVerify.errors, metrics.getTextVerifyLatencies);
  line("getAllStatuses",   metrics.status.ok,        metrics.status.errors,        metrics.statusLatencies);
  line("chatPoll getText", metrics.chatPoll.ok,      metrics.chatPoll.errors,      metrics.chatPollLatencies);

  console.log("\nDone.");
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
