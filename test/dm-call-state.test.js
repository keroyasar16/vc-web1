const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const WebSocket = require("ws");
const { createServer } = require("../server.js");

async function startApp() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vc-group-"));
  const { server } = createServer({ dataFile: path.join(directory, "store.json") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const api = async (pathname, { method = "GET", token, body } = {}) => {
    const response = await fetch(base + pathname, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  };
  const register = async (username) => {
    const { data } = await api("/api/register", {
      method: "POST",
      body: { username, email: `${username}@example.com`, password: "password123" },
    });
    return { id: data.user.id, username, token: data.token };
  };
  const befriend = async (from, to) => {
    const sent = await api("/api/friends/requests", { method: "POST", token: from.token, body: { username: to.username } });
    await api(`/api/friends/requests/${sent.data.request.id}`, { method: "PATCH", token: to.token, body: { action: "accept" } });
  };
  const open = (pathname, token) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${pathname}`);
    socket.inbox = [];
    socket.waiters = [];
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const index = socket.waiters.findIndex((waiter) => waiter.match(message));
      if (index >= 0) socket.waiters.splice(index, 1)[0].resolve(message);
      else socket.inbox.push(message);
    });
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "presence-auth", token }));
      resolve(socket);
    });
    socket.on("error", reject);
  });
  const next = (socket, type, timeout = 2000) => {
    const index = socket.inbox.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(socket.inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match: (message) => message.type === type, resolve };
      socket.waiters.push(waiter);
      setTimeout(() => reject(new Error(`${type} bekleniyordu`)), timeout).unref();
    });
  };
  return { server, api, register, befriend, open, next };
}

test("DM araması: katılımcı durumu, çıkış sonrası yeniden katılım ve avatar", async (t) => {
  const app = await startApp();
  const sockets = [];
  t.after(() => { sockets.forEach((socket) => socket.terminate()); app.server.close(); });
  const alice = await app.register("alice");
  const bob = await app.register("bob");
  await app.befriend(alice, bob);
  const avatar = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal((await app.api("/api/me/profile", { method: "PATCH", token: bob.token, body: { avatar } })).status, 200);

  // Arama sonuçlarında avatar bulunmalı
  const search = await app.api("/api/users/search?q=bo", { token: alice.token });
  assert.equal(search.data.users[0].avatar, avatar);

  const alicePresence = await app.open("/presence", alice.token);
  const bobPresence = await app.open("/presence", bob.token);
  sockets.push(alicePresence, bobPresence);
  await app.next(alicePresence, "presence-ready");
  await app.next(bobPresence, "presence-ready");

  const callId = randomUUID();
  alicePresence.send(JSON.stringify({ type: "call-invite", callId, toUserId: bob.id }));
  await app.next(bobPresence, "call-invite");

  const conversationId = [alice.id, bob.id].sort().join(":");
  const aliceRoom = await app.open(`/signal?name=alice&room=call-${callId}`, alice.token);
  sockets.push(aliceRoom);
  let state = await app.next(bobPresence, "dm-call-state");
  assert.equal(state.conversationId, conversationId);
  assert.deepEqual(state.participants.map((p) => p.username), ["alice"]);

  const bobRoom = await app.open(`/signal?name=bob&room=call-${callId}`, bob.token);
  sockets.push(bobRoom);
  await app.next(alicePresence, "dm-call-state");
  state = await app.next(alicePresence, "dm-call-state").catch(() => state);

  // Alice aramadan çıkar: Bob hâlâ odada, durum Bob'u göstermeli
  aliceRoom.close();
  const afterLeave = await app.next(bobPresence, "dm-call-state");
  assert.ok(afterLeave.participants.length >= 1);

  // Alice yeniden bağlanınca (sayfa yenileme) aktif aramayı görmeli
  const aliceAgain = await app.open("/presence", alice.token);
  sockets.push(aliceAgain);
  const restored = await app.next(aliceAgain, "dm-call-state");
  assert.equal(restored.callId, callId);
  assert.equal(restored.participants.some((p) => p.username === "bob" && p.avatar === avatar), true);

  // Alice tekrar katılır
  const aliceRoom2 = await app.open(`/signal?name=alice&room=call-${callId}`, alice.token);
  sockets.push(aliceRoom2);
  await app.next(aliceAgain, "dm-call-state");

  // Herkes çıkınca arama biter
  bobRoom.close();
  aliceRoom2.close();
  let ended;
  for (let i = 0; i < 5 && !ended; i += 1) {
    const message = await app.next(bobPresence, "dm-call-state");
    if (message.participants.length === 0) ended = message;
  }
  assert.ok(ended, "arama bitti durumu bekleniyordu");
});
