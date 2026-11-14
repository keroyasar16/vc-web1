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

test("grup DM: kurma, ekleme, mesajlaşma, arama ve ayrılma", async (t) => {
  const app = await startApp();
  const sockets = [];
  t.after(() => { sockets.forEach((socket) => socket.terminate()); app.server.close(); });
  const [alice, bob, carol, dave] = [await app.register("alice"), await app.register("bob"),
    await app.register("carol"), await app.register("dave")];
  await app.befriend(alice, bob);
  await app.befriend(alice, carol);

  // --- grup kurma kuralları ---
  assert.equal((await app.api("/api/groups", { method: "POST", token: alice.token, body: { memberIds: [bob.id] } })).status, 400);
  assert.equal((await app.api("/api/groups", { method: "POST", token: alice.token, body: { memberIds: [bob.id, dave.id] } })).status, 403);
  const created = await app.api("/api/groups", { method: "POST", token: alice.token, body: { memberIds: [bob.id, carol.id] } });
  assert.equal(created.status, 201);
  const group = created.data.group;
  assert.equal(group.isGroup, true);
  assert.equal(group.members.length, 3);

  const bobDms = await app.api("/api/dms", { token: bob.token });
  assert.equal(bobDms.data.groups.length, 1);
  assert.equal(bobDms.data.users.length, 0);
  assert.equal((await app.api("/api/dms", { token: dave.token })).data.groups.length, 0);

  // --- grup mesajı herkese ulaşır, üye olmayan giremez ---
  const alicePresence = await app.open("/presence", alice.token); sockets.push(alicePresence);
  const bobPresence = await app.open("/presence", bob.token); sockets.push(bobPresence);
  const carolPresence = await app.open("/presence", carol.token); sockets.push(carolPresence);
  const aliceChat = await app.open(`/dm?group=${group.id}`, alice.token); sockets.push(aliceChat);
  const bobChat = await app.open(`/dm?group=${group.id}`, bob.token); sockets.push(bobChat);
  await app.next(aliceChat, "dm-history");
  await app.next(bobChat, "dm-history");
  aliceChat.send(JSON.stringify({ type: "dm-message", text: "merhaba grup" }));
  assert.equal((await app.next(bobChat, "dm-message")).message.text, "merhaba grup");
  assert.equal((await app.next(aliceChat, "dm-message")).message.groupId, group.id);
  const carolNote = await app.next(carolPresence, "notification");
  assert.equal(carolNote.notification.sourceId, group.id);

  const daveChat = await app.open(`/dm?group=${group.id}`, dave.token); sockets.push(daveChat);
  await new Promise((resolve) => daveChat.on("close", (code) => { assert.equal(code, 1008); resolve(); }));

  // --- grup sesli/görüntülü arama (arkadaş olmayan üyeler dahil) ---
  const groupCallId = randomUUID();
  alicePresence.send(JSON.stringify({ type: "call-invite", callId: groupCallId, groupId: group.id, video: true }));
  const bobInvite = await app.next(bobPresence, "call-invite");
  const carolInvite = await app.next(carolPresence, "call-invite");
  assert.equal(bobInvite.video, true);
  assert.equal(bobInvite.groupId, group.id);
  assert.equal(carolInvite.fromUserId, alice.id);
  assert.equal((await app.next(alicePresence, "call-invite-result")).delivered, true);
  carolPresence.send(JSON.stringify({ type: "call-response", callId: groupCallId, toUserId: bob.id, groupId: group.id, accepted: true }));
  assert.equal((await app.next(bobPresence, "call-response")).accepted, true);
  // grup dışından biri gruba arama başlatamaz
  const davePresence = await app.open("/presence", dave.token); sockets.push(davePresence);
  davePresence.send(JSON.stringify({ type: "call-invite", callId: randomUUID(), groupId: group.id }));
  assert.equal((await app.next(davePresence, "call-invite-result")).delivered, false);

  // --- 1:1 görüntülü arama bayrağı ---
  const callId = randomUUID();
  alicePresence.send(JSON.stringify({ type: "call-invite", callId, toUserId: bob.id, video: true }));
  const direct = await app.next(bobPresence, "call-invite");
  assert.equal(direct.video, true);
  assert.equal(direct.groupId, undefined);
  alicePresence.send(JSON.stringify({ type: "call-invite", callId: randomUUID(), toUserId: bob.id }));
  assert.equal((await app.next(bobPresence, "call-invite")).video, false);

  // --- kişi ekleme ---
  assert.equal((await app.api(`/api/groups/${group.id}/members`, { method: "POST", token: alice.token, body: { userIds: [dave.id] } })).status, 403);
  await app.befriend(alice, dave);
  const added = await app.api(`/api/groups/${group.id}/members`, { method: "POST", token: alice.token, body: { userIds: [dave.id] } });
  assert.equal(added.status, 200);
  assert.equal(added.data.group.members.length, 4);
  assert.equal((await app.api(`/api/groups/${group.id}/members`, { method: "POST", token: dave.token, body: { userIds: [dave.id] } })).status, 400);
  assert.equal((await app.api(`/api/groups/${group.id}/members`, { method: "POST", token: randomUUID(), body: { userIds: [] } })).status, 401);

  // --- ayrılma ---
  assert.equal((await app.api(`/api/groups/${group.id}/leave`, { method: "POST", token: carol.token, body: {} })).status, 200);
  assert.equal((await app.api("/api/dms", { token: carol.token })).data.groups.length, 0);
  const afterLeave = await app.api("/api/dms", { token: alice.token });
  assert.equal(afterLeave.data.groups[0].members.length, 3);
});
