const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { createHash, randomUUID, randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");
const MAX_SERVER_IMAGE_BYTES = 256 * 1024;
const MAX_JSON_BODY_BYTES = 512 * 1024;
const SERVER_PERMISSION_DEFINITIONS = {
  manage_server: {
    name: "Sunucuyu Yönet",
    description: "Sunucu adını, fotoğrafını ve sunucu şifresini değiştirmeye izin verir.",
  },
  manage_channels: {
    name: "Kanalları Yönet",
    description: "Sunucuda kategori, ses ve sohbet kanalı oluşturup düzenlemeye izin verir.",
  },
  move_channels: {
    name: "Kanalları Taşı",
    description: "Kanal ve kategorilerin sırasını ve kategori konumunu değiştirmeye izin verir.",
  },
  manage_roles: {
    name: "Rolleri Yönet",
    description: "Roller oluşturup düzenlemeye, silmeye ve üyelere rol atamaya izin verir.",
  },
  manage_nicknames: {
    name: "Takma Adları Yönet",
    description: "Üyelerin bu sunucudaki takma adlarını değiştirmeye izin verir.",
  },
  kick_members: {
    name: "Üyeleri At",
    description: "Üyeleri bu sunucudan çıkarmaya izin verir.",
  },
  ban_members: {
    name: "Üyeleri Yasakla",
    description: "Üyeleri sunucudan çıkarmaya ve yeniden katılmalarını engellemeye izin verir.",
  },
  create_invite: {
    name: "Davet Oluştur",
    description: "Sunucuya katılmak için yeni davet bağlantısı oluşturmaya izin verir.",
  },
};
const CHANNEL_PERMISSION_DEFINITIONS = {
  view_channel: {
    name: "Kanalı Görüntüle",
    description: "Üyelerin bu kanalı ve içindeki kullanıcıları görmesini sağlar.",
    category: "Genel Kanal İzinleri",
  },
  manage_channel: {
    name: "Kanalı Yönet",
    description: "Üyelerin bu kanalın adını düzenlemesine ve kanalı silmesine izin verir.",
    category: "Genel Kanal İzinleri",
  },
  manage_permissions: {
    name: "İzinleri Yönet",
    description: "Üyelerin bu kanalın izinlerini değiştirmesini sağlar.",
    category: "Genel Kanal İzinleri",
  },
  connect: {
    name: "Ses Kanalına Bağlan",
    description: "Üyelerin bu ses kanalına katılmasını sağlar.",
    category: "Üyelik İzinleri",
  },
  create_invite: {
    name: "Davet Oluştur",
    description: "Üyelerin bu kanala özel davet bağlantısı oluşturmasını sağlar.",
    category: "Üyelik İzinleri",
  },
  send_messages: {
    name: "Mesaj Gönder",
    description: "Üyelerin bu kanala ait sohbet kanalında mesaj göndermesini sağlar.",
    category: "Metin Kanalı İzinleri",
  },
};

const publicDirectory = path.join(__dirname, "public");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const passwordBytes = 64;

function publicUserProfile(user) {
  return {
    id: user.id,
    username: user.username,
    bio: typeof user.bio === "string" ? user.bio : "",
    avatar: typeof user.avatar === "string" ? user.avatar : "",
    createdAt: typeof user.createdAt === "string" ? user.createdAt : null,
  };
}

function privateUserAccount(user) {
  return {
    ...publicUserProfile(user),
    email: typeof user.email === "string" ? user.email : "",
    allowDirectMessages: user.allowDirectMessages === true,
  };
}

function createServer({ dataFile = path.join(__dirname, "data", "store.json") } = {}) {
  const rooms = new Map();
  const chatRooms = new Map();
  const directMessageRooms = new Map();
  const serverConnections = new Map();
  const userConnections = new Map();
  const sessions = new Map();
  const resetRateLimits = new Map();
  let webSocketServers = [];
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  let migratedSessionIds = false;

  let store = { users: [], servers: [], sessions: [], messages: [], directMessages: [], notifications: [] };
  if (fs.existsSync(dataFile)) {
    try {
      store = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      if (!Array.isArray(store.users) || !Array.isArray(store.servers)) {
        throw new Error("Store must contain users and servers arrays");
      }
      if (!Array.isArray(store.sessions)) store.sessions = [];
      if (!Array.isArray(store.messages)) store.messages = [];
      if (!Array.isArray(store.passwordResets)) store.passwordResets = [];
  if (!Array.isArray(store.friendRequests)) store.friendRequests = [];
      if (!Array.isArray(store.directMessages)) store.directMessages = [];
      if (!Array.isArray(store.notifications)) store.notifications = [];
    } catch (error) {
      throw new Error(`Could not load application data from ${dataFile}: ${error.message}`, { cause: error });
    }
    for (const session of store.sessions) {
      if (typeof session.tokenHash === "string" && typeof session.userId === "string") {
        sessions.set(session.tokenHash, session.userId);
      }
      if (!session.id) {
        session.id = randomUUID();
        migratedSessionIds = true;
      }
    }
  }
  if (!Array.isArray(store.friendRequests)) store.friendRequests = [];
  if (!Array.isArray(store.directMessages)) store.directMessages = [];
  if (!Array.isArray(store.notifications)) store.notifications = [];
  for (const user of store.users) {
    if (!Array.isArray(user.friends)) user.friends = [];
    if (!Array.isArray(user.blockedUsers)) user.blockedUsers = [];
  }
  for (const server of store.servers) {
    if (!server.nicknames || typeof server.nicknames !== "object" || Array.isArray(server.nicknames)) {
      server.nicknames = {};
    }
    if (!Array.isArray(server.bannedUserIds)) server.bannedUserIds = [];
  }

  // Short, cryptographically random invitation codes; avoid collisions with old aliases.
  const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  function generateInviteCode() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const bytes = randomBytes(7);
      const code = Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
      if (!store.servers.some((item) => item.inviteCode === code || item.legacyInviteCodes?.includes(code))) return code;
    }
    throw new Error("Benzersiz davet kodu oluşturulamadı.");
  }

  function matchesInviteCode(server, code) {
    return Boolean(code) && (server.inviteCode === code || server.legacyInviteCodes?.includes(code));
  }

  function findServerByInviteOrName(value) {
    const query = String(value || "").trim();
    if (!query) return { error: "Davet kodu veya sunucu adı gir." };
    const byCode = store.servers.find((item) => matchesInviteCode(item, query));
    if (byCode) return { server: byCode };
    const matchingNames = store.servers.filter((item) => item.name.toLocaleLowerCase("tr") === query.toLocaleLowerCase("tr"));
    if (matchingNames.length > 1) return { error: "Bu isimde birden fazla sunucu var. Katılmak için 7 karakterlik davet kodunu kullan.", status: 409 };
    if (matchingNames.length === 1) return { server: matchingNames[0] };
    return { error: "Davet kodu veya sunucu adıyla eşleşen sunucu bulunamadı.", status: 404 };
  }

  // Upgrade existing long codes without invalidating old shared links.
  let inviteCodesMigrated = false;
  for (const item of store.servers) {
    if (typeof item.inviteCode !== "string" || item.inviteCode.length !== 7) {
      if (item.inviteCode) {
        if (!Array.isArray(item.legacyInviteCodes)) item.legacyInviteCodes = [];
        if (!item.legacyInviteCodes.includes(item.inviteCode)) item.legacyInviteCodes.push(item.inviteCode);
      }
      item.inviteCode = generateInviteCode();
      inviteCodesMigrated = true;
    }
  }

  function persistStore() {
    const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
      fs.renameSync(temporaryFile, dataFile);
    } catch (error) {
      if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
      throw error;
    }
  }

  if (migratedSessionIds || inviteCodesMigrated) persistStore();

  function sendJson(response, status, payload) {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(payload));
  }

  function readJson(request) {
    return new Promise((resolve, reject) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
        if (body.length > MAX_JSON_BODY_BYTES) {
          reject(Object.assign(new Error("İstek çok büyük."), { status: 413 }));
          request.destroy();
        }
      });
      request.on("end", () => {
        try {
          resolve(JSON.parse(body || "{}"));
        } catch {
          reject(Object.assign(new Error("Geçersiz JSON isteği."), { status: 400 }));
        }
      });
      request.on("error", reject);
    });
  }

  function getUser(request) {
    const token = request.headers.authorization?.match(/^Bearer ([\da-f-]{36})$/i)?.[1];
    if (!token) return undefined;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return store.users.find((user) => user.id === sessions.get(tokenHash));
  }

  function getUserFromToken(token) {
    if (typeof token !== "string" || !token || token.length > 128) return undefined;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return store.users.find((user) => user.id === sessions.get(tokenHash));
  }

  function closeSessionConnections(tokenHash) {
    for (const webSocketServer of webSocketServers) {
      for (const connection of webSocketServer.clients) {
        if (connection.sessionTokenHash === tokenHash) connection.close(1008, "Oturum kapatıldı");
      }
    }
  }

  function getServerMembers(serverId) {
    const serverRecord = store.servers.find((server) => server.id === serverId);
    return store.users
      .filter((user) => user.servers.includes(serverId))
      .map((user) => ({
        id: user.id,
        username: user.username,
        nickname: serverRecord.nicknames?.[user.id] || "",
        avatar: user.avatar || "",
        isOnline: isUserOnline(user.id),
      }));
  }

  function getServerVoiceParticipants(serverId) {
    const serverRecord = store.servers.find((server) => server.id === serverId);
    const connections = serverConnections.get(serverId) || [];
    const voiceConnections = Array.from(connections)
      .filter((connection) => connection.presenceKind === "voice" && connection.clientId && connection.presenceUserId && connection.readyState === WebSocket.OPEN);
    const voiceParticipants = [];
    const seenUsers = new Set();
    for (const connection of voiceConnections) {
      if (connection.presenceUserId && seenUsers.has(connection.presenceUserId)) continue;
      if (connection.presenceUserId) seenUsers.add(connection.presenceUserId);
      voiceParticipants.push({
        id: connection.presenceUserId || `guest:${connection.clientId}`,
        clientId: connection.clientId,
        username: connection.presenceUserId
          ? serverRecord?.nicknames?.[connection.presenceUserId] || connection.displayName
          : connection.displayName,
        channelId: connection.channelId,
        avatar: connection.presenceUserId
          ? store.users.find((user) => user.id === connection.presenceUserId)?.avatar || ""
          : "",
        microphoneMuted: connection.voiceState?.microphoneMuted === true,
        soundMuted: connection.voiceState?.soundMuted === true,
        sharing: connection.voiceState?.sharing === true,
      });
    }
    return voiceParticipants;
  }

  function isUserOnline(userId) {
    return (userConnections.get(userId)?.size || 0) > 0;
  }

  function getOnlineUsers() {
    return Array.from(userConnections.keys())
      .map((userId) => store.users.find((user) => user.id === userId))
      .filter(Boolean)
      .map((user) => ({ id: user.id, username: user.username }));
  }

  function publishOnlineUsers(excludedConnection) {
    const message = JSON.stringify({ type: "online-users", users: getOnlineUsers() });
    for (const connections of userConnections.values()) {
      for (const connection of connections) {
        if (connection !== excludedConnection &&
          connection.presenceKind === "presence" && connection.readyState === WebSocket.OPEN) {
          connection.send(message);
        }
      }
    }
  }

  function setConnectionUser(webSocket, userId) {
    const previousUserId = webSocket.presenceUserId;
    if (previousUserId === userId) return;
    if (previousUserId) {
      const previousConnections = userConnections.get(previousUserId);
      previousConnections?.delete(webSocket);
      if (previousConnections?.size === 0) {
        userConnections.delete(previousUserId);
        publishFriendPresence(previousUserId, false);
        publishOnlineUsers();
        const previousUser = store.users.find((user) => user.id === previousUserId);
        for (const serverId of previousUser?.servers || []) publishServerMembers(serverId);
      }
    }
    webSocket.presenceUserId = userId;
    if (userId) {
      let connections = userConnections.get(userId);
      if (!connections) {
        connections = new Set();
        userConnections.set(userId, connections);
      }
      const wasOffline = connections.size === 0;
      connections.add(webSocket);
      if (wasOffline) {
        publishFriendPresence(userId, true);
        publishOnlineUsers(webSocket);
        for (const serverId of store.users.find((user) => user.id === userId)?.servers || []) {
          publishServerMembers(serverId);
        }
      }
    }
  }

  function areFriends(firstUserId, secondUserId) {
    const first = store.users.find((item) => item.id === firstUserId);
    const second = store.users.find((item) => item.id === secondUserId);
    return Boolean(
      first?.friends?.includes(secondUserId) &&
      second?.friends?.includes(firstUserId) &&
      !first.blockedUsers?.includes(secondUserId) &&
      !second.blockedUsers?.includes(firstUserId),
    );
  }

  function canDirectMessage(senderId, recipientId) {
    const sender = store.users.find((item) => item.id === senderId);
    const recipient = store.users.find((item) => item.id === recipientId);
    return Boolean(sender && recipient && senderId !== recipientId &&
      !sender.blockedUsers?.includes(recipientId) &&
      !recipient.blockedUsers?.includes(senderId) &&
      (areFriends(senderId, recipientId) || recipient.allowDirectMessages === true));
  }

  function notifyUser(userId, notification) {
    const record = {
      id: randomUUID(),
      userId,
      readAt: null,
      createdAt: new Date().toISOString(),
      ...notification,
    };
    const previousNotifications = store.notifications;
    const unreadForUser = previousNotifications.filter((item) => item.userId === userId);
    const removeIds = new Set(unreadForUser.slice(0, Math.max(0, unreadForUser.length - 99)).map((item) => item.id));
    store.notifications = previousNotifications.filter((item) => !removeIds.has(item.id));
    store.notifications.push(record);
    try {
      persistStore();
    } catch (error) {
      store.notifications = previousNotifications;
      console.error("Bildirim kaydedilemedi:", error);
      return;
    }
    const serialized = JSON.stringify({ type: "notification", notification: record });
    for (const connection of userConnections.get(userId) || []) {
      if (connection.presenceKind === "presence" && connection.readyState === WebSocket.OPEN) {
        connection.send(serialized);
      }
    }
  }

  function publishFriendPresence(userId, isOnline) {
    const user = store.users.find((item) => item.id === userId);
    if (!user) return;
    const message = JSON.stringify({ type: "presence-update", userId, isOnline });
    for (const friendId of user.friends || []) {
      for (const connection of userConnections.get(friendId) || []) {
        if (connection.presenceKind === "presence" && connection.readyState === WebSocket.OPEN) {
          connection.send(message);
        }
      }
    }
  }

  function publishServerMembers(serverId, excludedConnection) {
    const connections = new Set(serverConnections.get(serverId) || []);
    for (const userConnectionsForServer of userConnections.values()) {
      for (const connection of userConnectionsForServer) {
        if (connection.presenceKind === "presence" && connection.subscribedServerId === serverId) {
          connections.add(connection);
        }
      }
    }
    if (connections.size === 0) return;
    const message = JSON.stringify({
      type: "server-members",
      serverId,
      members: getServerMembers(serverId),
      voiceParticipants: getServerVoiceParticipants(serverId),
    });
    for (const connection of connections) {
      if (connection !== excludedConnection && connection.readyState === WebSocket.OPEN) {
        connection.send(message);
      }
    }
  }

  function registerServerConnection(webSocket, serverId, userId, kind, shouldPublish = true) {
    webSocket.presenceServerId = serverId;
    setConnectionUser(webSocket, userId);
    webSocket.presenceKind = kind;
    let connections = serverConnections.get(serverId);
    if (!connections) {
      connections = new Set();
      serverConnections.set(serverId, connections);
    }
    connections.add(webSocket);
    if (shouldPublish) publishServerMembers(serverId);
  }

  function unregisterServerConnection(webSocket) {
    setConnectionUser(webSocket, undefined);
    const serverId = webSocket.presenceServerId;
    const connections = serverConnections.get(serverId);
    if (!connections) return;
    connections.delete(webSocket);
    if (connections.size === 0) serverConnections.delete(serverId);
    // Also broadcast when the LAST voice user leaves the room.
    publishServerMembers(serverId);
  }

  function createSession(userId, request) {
    const token = randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = {
      id: randomUUID(),
      tokenHash,
      userId,
      createdAt: new Date().toISOString(),
      device: typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"].slice(0, 256)
        : "Bilinmeyen cihaz",
    };
    store.sessions.push(session);
    sessions.set(tokenHash, userId);
    try {
      persistStore();
    } catch (error) {
      store.sessions.pop();
      sessions.delete(tokenHash);
      throw error;
    }
    return token;
  }

  function publicServer(server, userId) {
    const permissions = getServerPermissions(server, userId);
    return {
      id: server.id,
      name: server.name,
      inviteCode: server.inviteCode,
      image: server.image || "",
      hasPassword: Boolean(server.passwordHash && server.passwordSalt),
      categories: server.categories || [],
      channels: server.channels
        .filter((channel) => hasChannelPermission(server, channel, userId, "view_channel") ||
          canManageChannel(server, channel, userId) || canManageChannelPermissions(server, channel, userId))
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type || "voice",
          legacyChat: !channel.type,
          categoryId: channel.categoryId || null,
          canManage: canManageChannel(server, channel, userId),
          canManagePermissions: canManageChannelPermissions(server, channel, userId),
          canCreateInvite: hasChannelPermission(server, channel, userId, "create_invite"),
        })),
      canManage: permissions.includes("manage_server"),
      canDelete: server.ownerId === userId,
      canManageRoles: permissions.includes("manage_roles"),
      canManageChannels: permissions.includes("manage_channels"),
      canMoveChannels: permissions.includes("move_channels"),
      canManageNicknames: permissions.includes("manage_nicknames"),
      canKickMembers: permissions.includes("kick_members"),
      canBanMembers: permissions.includes("ban_members"),
      canCreateInvite: permissions.includes("create_invite"),
    };
  }

  function getServerPermissions(server, userId) {
    if (!userId) return [];
    if (server.ownerId === userId) return Object.keys(SERVER_PERMISSION_DEFINITIONS);
    if (!store.users.some((user) => user.id === userId && user.servers.includes(server.id))) return [];
    const memberRoleIds = server.memberRoles?.[userId] || [];
    const roles = (server.roles || []).filter((role) =>
      role.id === "everyone" || memberRoleIds.includes(role.id));
    return [...new Set(roles.flatMap((role) =>
      Array.isArray(role.permissions)
        ? role.permissions.filter((permission) => Object.hasOwn(SERVER_PERMISSION_DEFINITIONS, permission))
        : []))];
  }

  function hasServerPermission(server, userId, permission) {
    return getServerPermissions(server, userId).includes(permission);
  }

  function getChannelPermission(server, channel, userId, permission) {
    if (server.ownerId === userId) return true;
    const defaultValue = permission === "manage_channel" || permission === "manage_permissions"
      ? hasServerPermission(server, userId, "manage_channels")
      : permission === "create_invite"
        ? hasServerPermission(server, userId, "create_invite")
        : true;
    const roleIds = ["everyone", ...(server.memberRoles?.[userId] || [])];
    let value = defaultValue;
    for (const roleId of roleIds) {
      const state = channel.permissionOverwrites?.[roleId]?.[permission];
      if (state === "allow") value = true;
      else if (state === "deny") value = false;
    }
    return value;
  }

  function hasChannelPermission(server, channel, userId, permission) {
    return getChannelPermission(server, channel, userId, permission);
  }

  function canManageChannel(server, channel, userId) {
    return server.ownerId === userId ||
      hasServerPermission(server, userId, "manage_channels") ||
      hasChannelPermission(server, channel, userId, "manage_channel");
  }

  function canManageChannelPermissions(server, channel, userId) {
    return server.ownerId === userId ||
      hasServerPermission(server, userId, "manage_channels") ||
      hasChannelPermission(server, channel, userId, "manage_permissions");
  }

  function ensureServerRoles(server) {
    if (!Array.isArray(server.roles)) server.roles = [];
    if (!server.roles.some((role) => role.id === "everyone")) {
      server.roles.unshift({
        id: "everyone",
        name: "Varsayılan izinler",
        color: "#949ba4",
        permissions: [],
        isDefault: true,
      });
    }
    if (!server.memberRoles || typeof server.memberRoles !== "object" || Array.isArray(server.memberRoles)) {
      server.memberRoles = {};
    }
  }

  function hashServerPassword(password, salt) {
    return scryptSync(password, salt, passwordBytes).toString("hex");
  }

  async function handleApi(request, response, requestUrl) {
    const { pathname } = requestUrl;

    // Reset tokens are random, single-use, stored only as SHA-256 hashes and expire in 30 minutes.
    if (request.method === "POST" && pathname === "/api/password/forgot") {
      const body = await readJson(request);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        sendJson(response, 400, { error: "Geçerli bir e-posta adresi gir." });
        return;
      }
      const ip = (request.socket.remoteAddress || "unknown").slice(0, 80);
      const now = Date.now();
      for (const [key, expires] of resetRateLimits) if (expires <= now) resetRateLimits.delete(key);
      if (resetRateLimits.size > 10000) resetRateLimits.clear();
      const ipKey = `ip:${ip}`;
      const emailKey = `email:${createHash("sha256").update(email).digest("hex")}`;
      if (resetRateLimits.has(ipKey) || resetRateLimits.has(emailKey)) {
        sendJson(response, 200, { message: "Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderilecektir." });
        return;
      }
      resetRateLimits.set(ipKey, now + 30_000);
      resetRateLimits.set(emailKey, now + 60_000);
      const user = store.users.find((item) => item.email?.toLowerCase() === email);
      if (user) {
        const apiKey = process.env.RESEND_API_KEY;
        const mailFrom = process.env.MAIL_FROM;
        const baseUrl = process.env.APP_BASE_URL;
        if (!apiKey || !mailFrom || !baseUrl || !/^https:\/\/[^/]+/.test(baseUrl)) {
          console.error("Şifre sıfırlama e-posta ayarları eksik: RESEND_API_KEY, MAIL_FROM, APP_BASE_URL");
          sendJson(response, 503, { error: "E-posta servisi henüz yapılandırılmadı." });
          return;
        }
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const resetLink = `${baseUrl.replace(/\/$/, "")}/?reset_token=${encodeURIComponent(token)}`;
        const message = `VC hesabının şifresini sıfırlamak için bağlantıyı aç:\n\n${resetLink}\n\nBağlantı 30 dakika geçerlidir ve bir kez kullanılabilir. Bu isteği sen yapmadıysan e-postayı yok say.`;
        let mailResponse;
        try {
          mailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: mailFrom, to: [user.email], subject: "VC - Şifre sıfırlama", text: message }),
            signal: AbortSignal.timeout(10000),
          });
        } catch (error) {
          console.error("Şifre sıfırlama e-postası gönderilemedi:", error.message);
          sendJson(response, 503, { error: "E-posta gönderilemedi. Daha sonra tekrar dene." });
          return;
        }
        if (!mailResponse.ok) {
          console.error("E-posta servisi başarısız:", mailResponse.status);
          sendJson(response, 503, { error: "E-posta gönderilemedi. Daha sonra tekrar dene." });
          return;
        }
        store.passwordResets = store.passwordResets.filter((entry) => entry.userId !== user.id && entry.expiresAt > now);
        store.passwordResets.push({ userId: user.id, tokenHash, expiresAt: now + 30 * 60 * 1000 });
        persistStore();
      }
      sendJson(response, 200, { message: "Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderilecektir." });
      return;
    }

    if (request.method === "POST" && pathname === "/api/password/reset") {
      const body = await readJson(request);
      const token = typeof body.token === "string" ? body.token : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!/^[0-9a-f]{64}$/.test(token) || password.length < 8 || password.length > 128) {
        sendJson(response, 400, { error: "Geçersiz bağlantı veya şifre (8-128 karakter olmalı)." });
        return;
      }
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const entry = store.passwordResets.find((item) => item.tokenHash === tokenHash && item.expiresAt > Date.now());
      const user = entry && store.users.find((item) => item.id === entry.userId);
      if (!user) {
        sendJson(response, 400, { error: "Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı iste." });
        return;
      }
      const salt = randomUUID();
      const newHash = scryptSync(password, salt, passwordBytes).toString("hex");
      const oldStore = JSON.stringify(store);
      user.salt = salt;
      user.passwordHash = newHash;
      store.passwordResets = store.passwordResets.filter((item) => item.userId !== user.id);
      const revoked = store.sessions.filter((item) => item.userId === user.id);
      store.sessions = store.sessions.filter((item) => item.userId !== user.id);
      try {
        persistStore();
      } catch (error) {
        store = JSON.parse(oldStore);
        throw error;
      }
      for (const session of revoked) {
        sessions.delete(session.tokenHash);
        closeSessionConnections(session.tokenHash);
      }
      sendJson(response, 200, { message: "Şifren değiştirildi. Yeni şifrenle giriş yapabilirsin." });
      return;
    }

    if (request.method === "POST" && ["/api/register", "/api/login"].includes(pathname)) {
      const body = await readJson(request);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLocaleLowerCase("en-US") : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (pathname === "/api/register" && !/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
        sendJson(response, 400, { error: "Kullanıcı adı 3-24 karakter olmalı; harf, rakam, _ ve - kullanılabilir." });
        return;
      }
      if (pathname === "/api/register" &&
        (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
        sendJson(response, 400, { error: "Geçerli bir e-posta adresi gir." });
        return;
      }
      if (password.length < 8 || password.length > 128) {
        sendJson(response, 400, { error: "Şifre en az 8, en fazla 128 karakter olmalı." });
        return;
      }

      const normalizedUsername = username.toLocaleLowerCase("tr");
      let user;
      if (pathname === "/api/register") {
        if (store.users.some((item) => item.username.toLocaleLowerCase("tr") === normalizedUsername)) {
          sendJson(response, 409, { error: "Bu kullanıcı adı zaten kullanılıyor." });
          return;
        }
        if (store.users.some((item) => item.email?.toLocaleLowerCase("en-US") === email)) {
          sendJson(response, 409, { error: "Bu e-posta adresi zaten kullanılıyor." });
          return;
        }
        const salt = randomUUID();
        user = {
          id: randomUUID(),
          username,
          email,
          allowDirectMessages: true,
          bio: "",
          createdAt: new Date().toISOString(),
          salt,
          passwordHash: scryptSync(password, salt, passwordBytes).toString("hex"),
          servers: [],
          friends: [],
          blockedUsers: [],
        };
        store.users.push(user);
        try {
          persistStore();
        } catch (error) {
          store.users.pop();
          throw error;
        }
      } else {
        const identifier = typeof body.email === "string" ? body.email.trim() : username;
        user = store.users.find((item) => item.email &&
          item.email.toLocaleLowerCase("en-US") === identifier.toLocaleLowerCase("en-US")) ||
          store.users.find((item) =>
            item.username.toLocaleLowerCase("tr") === identifier.toLocaleLowerCase("tr"));
        const candidateHash = scryptSync(password, user?.salt || "invalid-user-salt", passwordBytes);
        const savedHash = user ? Buffer.from(user.passwordHash, "hex") : Buffer.alloc(passwordBytes);
        if (!user || savedHash.length !== candidateHash.length || !timingSafeEqual(candidateHash, savedHash)) {
          sendJson(response, 401, { error: "Kullanıcı adı veya şifre hatalı." });
          return;
        }
      }

      const token = createSession(user.id, request);
      sendJson(response, pathname === "/api/register" ? 201 : 200, {
        token,
        user: privateUserAccount(user),
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/logout") {
      const token = request.headers.authorization?.match(/^Bearer ([\da-f-]{36})$/i)?.[1];
      if (token) {
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const sessionIndex = store.sessions.findIndex((session) => session.tokenHash === tokenHash);
        if (sessionIndex !== -1) {
          const [session] = store.sessions.splice(sessionIndex, 1);
          sessions.delete(tokenHash);
          try {
            persistStore();
          } catch (error) {
            store.sessions.splice(sessionIndex, 0, session);
            sessions.set(tokenHash, session.userId);
            throw error;
          }
          closeSessionConnections(tokenHash);
        }
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && pathname === "/api/me") {
      const user = getUser(request);
      sendJson(response, user ? 200 : 401, user ? { user: privateUserAccount(user) } : { error: "Oturum bulunamadı." });
      return;
    }

    if (request.method === "PATCH" && pathname === "/api/me/preferences") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kullanıcı ayarlarını değiştirmek için giriş yap." });
        return;
      }
      const body = await readJson(request);
      if (typeof body.allowDirectMessages !== "boolean") {
        sendJson(response, 400, { error: "Özel mesaj tercihini seç." });
        return;
      }
      const previousValue = user.allowDirectMessages;
      user.allowDirectMessages = body.allowDirectMessages;
      try {
        persistStore();
      } catch (error) {
        user.allowDirectMessages = previousValue;
        throw error;
      }
      sendJson(response, 200, { user: privateUserAccount(user) });
      return;
    }

    if (request.method === "GET" && pathname === "/api/notifications") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Bildirimleri görmek için giriş yap." });
        return;
      }
      const notifications = store.notifications
        .filter((item) => item.userId === user.id)
        .slice(-100);
      sendJson(response, 200, {
        notifications,
        unreadCount: notifications.filter((item) => !item.readAt).length,
      });
      return;
    }

    if (request.method === "PATCH" && pathname === "/api/notifications") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Bildirimleri güncellemek için giriş yap." });
        return;
      }
      const body = await readJson(request);
      if (!Array.isArray(body.ids) || body.ids.length > 100 ||
        body.ids.some((id) => typeof id !== "string")) {
        sendJson(response, 400, { error: "Geçerli bildirim kimlikleri gerekli." });
        return;
      }
      const requestedIds = new Set(body.ids);
      const changed = store.notifications.filter((item) =>
        item.userId === user.id && requestedIds.has(item.id) && !item.readAt);
      const readAt = new Date().toISOString();
      for (const item of changed) item.readAt = readAt;
      try {
        persistStore();
      } catch (error) {
        for (const item of changed) item.readAt = null;
        throw error;
      }
      const unreadCount = store.notifications.filter((item) => item.userId === user.id && !item.readAt).length;
      sendJson(response, 200, { unreadCount });
      return;
    }

    if (request.method === "GET" && pathname === "/api/users/search") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kullanıcı aramak için giriş yap." });
        return;
      }
      const query = requestUrl.searchParams.get("q")?.trim().toLocaleLowerCase("tr") || "";
      const results = query.length < 2 ? [] : store.users
        .filter((item) => item.id !== user.id && item.username.toLocaleLowerCase("tr").includes(query))
        .map((item) => ({
          id: item.id,
          username: item.username,
          isOnline: isUserOnline(item.id),
          isFriend: areFriends(user.id, item.id),
          canMessage: canDirectMessage(user.id, item.id),
        }))
        .slice(0, 20);
      sendJson(response, 200, { users: results });
      return;
    }

    if (request.method === "GET" && pathname === "/api/dms") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Mesajları görmek için giriş yap." });
        return;
      }
      const conversations = new Map();
      for (const message of store.directMessages) {
        if (message.senderId !== user.id && message.recipientId !== user.id) continue;
        const otherUserId = message.senderId === user.id ? message.recipientId : message.senderId;
        const conversationId = [user.id, otherUserId].sort().join(":");
        if (!canDirectMessage(user.id, otherUserId)) continue;
        const previous = conversations.get(otherUserId);
        if (!previous || previous.createdAt < message.createdAt) conversations.set(otherUserId, {
          id: otherUserId,
          username: store.users.find((item) => item.id === otherUserId)?.username || "",
          avatar: store.users.find((item) => item.id === otherUserId)?.avatar || "",
          isOnline: isUserOnline(otherUserId),
          isFriend: areFriends(user.id, otherUserId),
          canMessage: true,
          conversationId,
          createdAt: message.createdAt,
        });
      }
      sendJson(response, 200, {
        users: [...conversations.values()].filter((item) => item.username)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/me/sessions") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Oturumları görmek için giriş yap." });
        return;
      }
      const currentToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      const currentTokenHash = currentToken
        ? createHash("sha256").update(currentToken).digest("hex")
        : "";
      sendJson(response, 200, {
        sessions: store.sessions
          .filter((session) => session.userId === user.id)
          .map((session) => ({
            id: session.id || session.tokenHash,
            device: session.device || "Eski oturum",
            createdAt: session.createdAt || null,
            isCurrent: session.tokenHash === currentTokenHash,
          })),
      });
      return;
    }

    const sessionMatch = pathname.match(/^\/api\/me\/sessions\/([a-f\d-]{36}|[a-f\d]{64})$/i);
    if (request.method === "DELETE" && sessionMatch) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Oturumu kapatmak için giriş yap." });
        return;
      }
      const targetIndex = store.sessions.findIndex((session) =>
        session.userId === user.id && (session.id || session.tokenHash) === sessionMatch[1]);
      if (targetIndex < 0) {
        sendJson(response, 404, { error: "Oturum bulunamadı." });
        return;
      }
      const currentToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      const currentTokenHash = currentToken
        ? createHash("sha256").update(currentToken).digest("hex")
        : "";
      if (store.sessions[targetIndex].tokenHash === currentTokenHash) {
        sendJson(response, 400, { error: "Bu oturumu buradan kapatamazsın." });
        return;
      }
      const [removedSession] = store.sessions.splice(targetIndex, 1);
      sessions.delete(removedSession.tokenHash);
      try {
        persistStore();
      } catch (error) {
        store.sessions.splice(targetIndex, 0, removedSession);
        sessions.set(removedSession.tokenHash, removedSession.userId);
        throw error;
      }
      closeSessionConnections(removedSession.tokenHash);
      sendJson(response, 200, { ok: true });
      return;
    }

    const profileMatch = pathname.match(/^\/api\/users\/([a-f\d-]{36})\/profile$/i);
    if (request.method === "GET" && profileMatch) {
      const profile = store.users.find((item) => item.id === profileMatch[1]);
      sendJson(response, profile ? 200 : 404, profile
        ? { profile: publicUserProfile(profile) }
        : { error: "Kullanıcı bulunamadı." });
      return;
    }

    if (request.method === "PATCH" && pathname === "/api/me/profile") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Profili düzenlemek için giriş yap." });
        return;
      }
      const body = await readJson(request);
      const username = typeof body.username === "string" ? body.username.trim() : user.username;
      const bio = typeof body.bio === "string" ? body.bio.trim() : user.bio || "";
      if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
        sendJson(response, 400, { error: "Kullanıcı adı 3-24 karakter olmalı; harf, rakam, _ ve - kullanılabilir." });
        return;
      }
      if (bio.length > 500) {
        sendJson(response, 400, { error: "Biyografi en fazla 500 karakter olabilir." });
        return;
      }
      const normalizedUsername = username.toLocaleLowerCase("tr");
      if (store.users.some((item) =>
        item.id !== user.id && item.username.toLocaleLowerCase("tr") === normalizedUsername)) {
        sendJson(response, 409, { error: "Bu kullanıcı adı zaten kullanılıyor." });
        return;
      }
      let avatar = user.avatar || "";
      if (body.avatar !== undefined) {
        if (typeof body.avatar !== "string" ||
            (body.avatar !== "" && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.avatar)) ||
            Buffer.byteLength(body.avatar, "utf8") > 140000) {
          sendJson(response, 400, { error: "Profil fotoğrafı PNG, JPEG veya WebP olmalı ve 100 KB sınırını aşmamalı." });
          return;
        }
        avatar = body.avatar;
      }
      const previousProfile = { username: user.username, bio: user.bio, avatar: user.avatar };
      user.username = username;
      user.bio = bio;
      user.avatar = avatar;
      try {
        persistStore();
      } catch (error) {
        Object.assign(user, previousProfile);
        throw error;
      }
      for (const serverId of user.servers) publishServerMembers(serverId);
      // Notify all connected clients without persisting duplicate profile snapshots.
      const profileEvent = JSON.stringify({ type: "profile-updated", profile: publicUserProfile(user) });
      for (const connections of userConnections.values()) {
        for (const connection of connections) {
          if (connection.readyState === WebSocket.OPEN) connection.send(profileEvent);
        }
      }
      sendJson(response, 200, { profile: publicUserProfile(user) });
      return;
    }

    if (request.method === "POST" && pathname === "/api/me/password") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Şifreyi değiştirmek için giriş yap." });
        return;
      }
      const body = await readJson(request);
      if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string" ||
        body.newPassword.length < 8 || body.newPassword.length > 128) {
        sendJson(response, 400, { error: "Mevcut şifreni ve 8-128 karakterli yeni şifreni gir." });
        return;
      }
      const candidateHash = scryptSync(body.currentPassword, user.salt, passwordBytes);
      const savedHash = Buffer.from(user.passwordHash, "hex");
      if (savedHash.length !== candidateHash.length || !timingSafeEqual(candidateHash, savedHash)) {
        sendJson(response, 401, { error: "Mevcut şifre hatalı." });
        return;
      }
      const previousPassword = { salt: user.salt, passwordHash: user.passwordHash };
      const currentToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      const currentTokenHash = currentToken
        ? createHash("sha256").update(currentToken).digest("hex")
        : "";
      const previousSessions = store.sessions;
      const revokedSessions = store.sessions.filter((session) =>
        session.userId === user.id && session.tokenHash !== currentTokenHash);
      user.salt = randomUUID();
      user.passwordHash = scryptSync(body.newPassword, user.salt, passwordBytes).toString("hex");
      store.sessions = store.sessions.filter((session) =>
        session.userId !== user.id || session.tokenHash === currentTokenHash);
      for (const session of revokedSessions) sessions.delete(session.tokenHash);
      try {
        persistStore();
      } catch (error) {
        Object.assign(user, previousPassword);
        store.sessions = previousSessions;
        for (const session of revokedSessions) sessions.set(session.tokenHash, session.userId);
        throw error;
      }
      for (const session of revokedSessions) closeSessionConnections(session.tokenHash);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname === "/api/friends" && request.method === "GET") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Arkadaşlarını görmek için giriş yap." });
        return;
      }
      const byId = (userId) => {
        const friend = store.users.find((item) => item.id === userId);
        return friend
          ? { id: friend.id, username: friend.username, avatar: friend.avatar || "", isOnline: isUserOnline(friend.id) }
          : undefined;
      };
      sendJson(response, 200, {
        friends: (user.friends || []).map(byId).filter(Boolean),
        blockedUserIds: user.blockedUsers || [],
        incomingRequests: store.friendRequests
          .filter((item) => item.toUserId === user.id)
          .map((item) => ({ id: item.id, user: byId(item.fromUserId) }))
          .filter((item) => item.user),
        outgoingRequests: store.friendRequests
          .filter((item) => item.fromUserId === user.id)
          .map((item) => ({ id: item.id, user: byId(item.toUserId) }))
          .filter((item) => item.user),
      });
      return;
    }

    if (pathname === "/api/friends/requests" && request.method === "POST") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Arkadaş eklemek için giriş yap." });
        return;
      }
      const body = await readJson(request);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const target = store.users.find((item) =>
        item.username.toLocaleLowerCase("tr") === username.toLocaleLowerCase("tr"));
      if (!target) {
        sendJson(response, 404, { error: "Bu kullanıcı adıyla bir hesap bulunamadı." });
        return;
      }
      if (target.id === user.id) {
        sendJson(response, 400, { error: "Kendine arkadaşlık isteği gönderemezsin." });
        return;
      }
      if (user.blockedUsers?.includes(target.id) || target.blockedUsers?.includes(user.id)) {
        sendJson(response, 409, { error: "Engellenen kullanıcıya arkadaşlık isteği gönderemezsin." });
        return;
      }
      if ((user.friends || []).includes(target.id)) {
        sendJson(response, 409, { error: "Bu kullanıcı zaten arkadaşın." });
        return;
      }
      const existingRequest = store.friendRequests.find((item) =>
        (item.fromUserId === user.id && item.toUserId === target.id) ||
        (item.fromUserId === target.id && item.toUserId === user.id));
      if (existingRequest) {
        sendJson(response, 409, { error: "Bu kullanıcıyla zaten bekleyen bir arkadaşlık isteğin var." });
        return;
      }
      const friendRequest = {
        id: randomUUID(),
        fromUserId: user.id,
        toUserId: target.id,
        createdAt: new Date().toISOString(),
      };
      store.friendRequests.push(friendRequest);
      try {
        persistStore();
      } catch (error) {
        store.friendRequests.pop();
        throw error;
      }
      notifyUser(target.id, {
        type: "friend-request",
        title: "Yeni arkadaşlık isteği",
        body: `${user.username} sana arkadaşlık isteği gönderdi.`,
        senderId: user.id,
        sourceId: friendRequest.id,
      });
      sendJson(response, 201, {
        request: { id: friendRequest.id, user: { id: target.id, username: target.username } },
      });
      return;
    }

    const friendRequestRoute = pathname.match(/^\/api\/friends\/requests\/([\da-f-]{36})$/i);
    if (friendRequestRoute && ["PATCH", "DELETE"].includes(request.method)) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Arkadaşlık isteklerini yönetmek için giriş yap." });
        return;
      }
      const friendRequest = store.friendRequests.find((item) =>
        item.id === friendRequestRoute[1] &&
        (request.method === "DELETE" ? item.fromUserId === user.id : item.toUserId === user.id));
      if (!friendRequest) {
        sendJson(response, 404, { error: "Bekleyen arkadaşlık isteği bulunamadı." });
        return;
      }
      let action = "decline";
      if (request.method === "PATCH") {
        const body = await readJson(request);
        if (!["accept", "decline"].includes(body.action)) {
          sendJson(response, 400, { error: "İstek için geçersiz işlem." });
          return;
        }
        action = body.action;
      }
      const requestIndex = store.friendRequests.indexOf(friendRequest);
      store.friendRequests.splice(requestIndex, 1);
      if (action === "accept") {
        user.friends.push(friendRequest.fromUserId);
        const sender = store.users.find((item) => item.id === friendRequest.fromUserId);
        if (sender && !sender.friends.includes(user.id)) sender.friends.push(user.id);
      }
      try {
        persistStore();
      } catch (error) {
        store.friendRequests.splice(requestIndex, 0, friendRequest);
        if (action === "accept") {
          user.friends = user.friends.filter((friendId) => friendId !== friendRequest.fromUserId);
          const sender = store.users.find((item) => item.id === friendRequest.fromUserId);
          if (sender) sender.friends = sender.friends.filter((friendId) => friendId !== user.id);
        }
        throw error;
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    const friendRoute = pathname.match(/^\/api\/friends\/([\da-f-]{36})$/i);
    if (friendRoute && request.method === "DELETE") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Arkadaşlarını yönetmek için giriş yap." });
        return;
      }
      const friendId = friendRoute[1];
      if (!(user.friends || []).includes(friendId)) {
        sendJson(response, 404, { error: "Arkadaş bulunamadı." });
        return;
      }
      const friend = store.users.find((item) => item.id === friendId);
      user.friends = user.friends.filter((id) => id !== friendId);
      if (friend) friend.friends = (friend.friends || []).filter((id) => id !== user.id);
      try {
        persistStore();
      } catch (error) {
        user.friends.push(friendId);
        if (friend) friend.friends.push(user.id);
        throw error;
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    const blockRoute = pathname.match(/^\/api\/users\/([\da-f-]{36})\/block$/i);
    if (blockRoute && ["POST", "DELETE"].includes(request.method)) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kullanıcıları engellemek için giriş yap." });
        return;
      }
      const targetId = blockRoute[1];
      const target = store.users.find((item) => item.id === targetId);
      if (!target || target.id === user.id) {
        sendJson(response, target ? 400 : 404, { error: target ? "Kendini engelleyemezsin." : "Kullanıcı bulunamadı." });
        return;
      }
      const previousBlockedUsers = [...(user.blockedUsers || [])];
      const previousUserFriends = [...(user.friends || [])];
      const previousTargetFriends = [...(target.friends || [])];
      const previousRequests = store.friendRequests;
      if (request.method === "POST") {
        user.blockedUsers ||= [];
        if (!user.blockedUsers.includes(targetId)) user.blockedUsers.push(targetId);
        user.friends = user.friends.filter((id) => id !== targetId);
        target.friends = (target.friends || []).filter((id) => id !== user.id);
        store.friendRequests = store.friendRequests.filter((item) =>
          !((item.fromUserId === user.id && item.toUserId === targetId) ||
            (item.fromUserId === targetId && item.toUserId === user.id)));
      } else {
        user.blockedUsers = user.blockedUsers.filter((id) => id !== targetId);
      }
      try {
        persistStore();
      } catch (error) {
        user.blockedUsers = previousBlockedUsers;
        user.friends = previousUserFriends;
        target.friends = previousTargetFriends;
        store.friendRequests = previousRequests;
        throw error;
      }
      const conversationId = [user.id, target.id].sort().join(":");
      for (const connection of directMessageRooms.get(conversationId) || []) {
        connection.close(1008, "Özel mesaj bağlantısı kapatıldı");
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "PATCH" && pathname === "/api/me") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kullanıcı ayarlarını değiştirmek için giriş yap." });
        return;
      }
      const body = await readJson(request);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
        sendJson(response, 400, { error: "Kullanıcı adı 3-24 karakter olmalı; harf, rakam, _ ve - kullanılabilir." });
        return;
      }
      const normalizedUsername = username.toLocaleLowerCase("tr");
      if (store.users.some((item) =>
        item.id !== user.id && item.username.toLocaleLowerCase("tr") === normalizedUsername)) {
        sendJson(response, 409, { error: "Bu kullanıcı adı zaten kullanılıyor." });
        return;
      }

      const isChangingPassword = body.currentPassword !== undefined || body.newPassword !== undefined;
      let nextPasswordSalt;
      let nextPasswordHash;
      if (isChangingPassword) {
        if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string" ||
          body.newPassword.length < 8 || body.newPassword.length > 128) {
          sendJson(response, 400, { error: "Şifre değiştirmek için mevcut şifreni ve 8-128 karakterli yeni şifreni gir." });
          return;
        }
        const candidateHash = scryptSync(body.currentPassword, user.salt, passwordBytes);
        const savedHash = Buffer.from(user.passwordHash, "hex");
        if (savedHash.length !== candidateHash.length || !timingSafeEqual(candidateHash, savedHash)) {
          sendJson(response, 401, { error: "Mevcut şifre hatalı." });
          return;
        }
        nextPasswordSalt = randomUUID();
        nextPasswordHash = scryptSync(body.newPassword, nextPasswordSalt, passwordBytes).toString("hex");
      }

      const previousSettings = {
        username: user.username,
        salt: user.salt,
        passwordHash: user.passwordHash,
      };
      const previousSessions = store.sessions;
      const currentToken = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      const currentTokenHash = currentToken
        ? createHash("sha256").update(currentToken).digest("hex")
        : "";
      const revokedSessions = isChangingPassword
        ? store.sessions.filter((session) =>
          session.userId === user.id && session.tokenHash !== currentTokenHash)
        : [];
      user.username = username;
      if (isChangingPassword) {
        user.salt = nextPasswordSalt;
        user.passwordHash = nextPasswordHash;
        store.sessions = store.sessions.filter((session) =>
          session.userId !== user.id || session.tokenHash === currentTokenHash);
        for (const session of revokedSessions) sessions.delete(session.tokenHash);
      }
      try {
        persistStore();
      } catch (error) {
        Object.assign(user, previousSettings);
        store.sessions = previousSessions;
        for (const session of revokedSessions) sessions.set(session.tokenHash, session.userId);
        throw error;
      }
      for (const session of revokedSessions) closeSessionConnections(session.tokenHash);
      for (const serverId of user.servers) publishServerMembers(serverId);
      sendJson(response, 200, { user: privateUserAccount(user) });
      return;
    }

    if (request.method === "GET" && pathname === "/api/servers/invite") {
      const code = requestUrl.searchParams.get("code");
      const serverRecord = store.servers.find((item) => matchesInviteCode(item, code));
      sendJson(response, serverRecord ? 200 : 404, serverRecord
        ? { server: publicServer(serverRecord, getUser(request)?.id) }
        : { error: "Davet bağlantısı geçersiz." });
      return;
    }

    if (request.method === "GET" && pathname === "/api/servers") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Sunucularını görmek için giriş yap." });
        return;
      }
      sendJson(response, 200, {
        servers: store.servers.filter((item) => user.servers.includes(item.id)).map((item) => publicServer(item, user.id)),
      });
      return;
    }

    const serverMembersRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/members$/i);
    if (request.method === "GET" && serverMembersRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Sunucu üyelerini görmek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === serverMembersRoute[1]);
      if (!serverRecord || !user.servers.includes(serverRecord.id)) {
        sendJson(response, 403, { error: "Bu sunucunun üyesi değilsin." });
        return;
      }
      sendJson(response, 200, {
        members: getServerMembers(serverRecord.id),
        voiceParticipants: getServerVoiceParticipants(serverRecord.id),
      });
      return;
    }

    const rolesRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/roles(?:\/([\da-f-]{36}|everyone))?$/i);
    if (rolesRoute && ["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Rolleri yönetmek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === rolesRoute[1]);
      if (!serverRecord ||
        (serverRecord.ownerId !== user.id &&
          (!user.servers.includes(serverRecord.id) || !hasServerPermission(serverRecord, user.id, "manage_roles")))) {
        sendJson(response, 403, { error: "Bu sunucuda rolleri yönetme yetkin yok." });
        return;
      }
      ensureServerRoles(serverRecord);

      if (request.method === "GET") {
        const members = store.users
          .filter((member) => member.servers.includes(serverRecord.id))
          .map((member) => ({
            id: member.id,
            username: member.username,
            nickname: serverRecord.nicknames?.[member.id] || "",
            roleIds: serverRecord.memberRoles[member.id] || [],
          }));
        sendJson(response, 200, {
          roles: serverRecord.roles,
          members: members.map((member) => ({ ...member, isOwner: member.id === serverRecord.ownerId })),
          canGrantManageServer: serverRecord.ownerId === user.id,
        });
        return;
      }

      if (request.method === "POST") {
        const body = await readJson(request);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const color = typeof body.color === "string" ? body.color : "";
        const permissions = body.permissions;
        if (name.length < 2 || name.length > 32) {
          sendJson(response, 400, { error: "Rol adı 2-32 karakter olmalı." });
          return;
        }
        if (!/^#[\da-f]{6}$/i.test(color)) {
          sendJson(response, 400, { error: "Rol rengi geçersiz." });
          return;
        }
        if (!Array.isArray(permissions) ||
          permissions.some((permission) => typeof permission !== "string" ||
            !Object.hasOwn(SERVER_PERMISSION_DEFINITIONS, permission))) {
          sendJson(response, 400, { error: "Rol izinleri geçersiz." });
          return;
        }
        if (serverRecord.ownerId !== user.id && permissions.includes("manage_server")) {
          sendJson(response, 403, { error: "Sunucuyu yönetme yetkisini yalnızca sunucu sahibi verebilir." });
          return;
        }
        if (serverRecord.roles.length >= 25) {
          sendJson(response, 400, { error: "Bir sunucuda en fazla 24 özel rol olabilir." });
          return;
        }
        if (serverRecord.roles.some((role) => role.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
          sendJson(response, 409, { error: "Bu isimde bir rol zaten var." });
          return;
        }
        const role = {
          id: randomUUID(),
          name,
          color,
          permissions: [...new Set(permissions)],
        };
        serverRecord.roles.push(role);
        try {
          persistStore();
        } catch (error) {
          serverRecord.roles.pop();
          throw error;
        }
        sendJson(response, 201, { role });
        return;
      }

      const roleId = rolesRoute[2];
      const role = serverRecord.roles.find((item) => item.id === roleId);
      if (!role) {
        sendJson(response, 404, { error: "Rol bulunamadı." });
        return;
      }
      if ((role.isDefault || role.id === "everyone") && request.method !== "PATCH") {
        sendJson(response, 400, { error: "Varsayılan rol değiştirilemez veya silinemez." });
        return;
      }
      if ((role.isDefault || role.id === "everyone") && serverRecord.ownerId !== user.id) {
        sendJson(response, 403, { error: "Varsayılan rol izinlerini yalnızca sunucu sahibi değiştirebilir." });
        return;
      }
      if (serverRecord.ownerId !== user.id && role.permissions.includes("manage_server")) {
        sendJson(response, 403, { error: "Sunucuyu yönetme yetkisi içeren rolü yalnızca sunucu sahibi değiştirebilir." });
        return;
      }

      if (request.method === "PATCH") {
        const body = await readJson(request);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const color = typeof body.color === "string" ? body.color : "";
        const permissions = body.permissions;
        if (name.length < 2 || name.length > 32) {
          sendJson(response, 400, { error: "Rol adı 2-32 karakter olmalı." });
          return;
        }
        if (!/^#[\da-f]{6}$/i.test(color)) {
          sendJson(response, 400, { error: "Rol rengi geçersiz." });
          return;
        }
        if (!Array.isArray(permissions) ||
          permissions.some((permission) => typeof permission !== "string" ||
            !Object.hasOwn(SERVER_PERMISSION_DEFINITIONS, permission))) {
          sendJson(response, 400, { error: "Rol izinleri geçersiz." });
          return;
        }
        if (serverRecord.ownerId !== user.id &&
          (permissions.includes("manage_server") || role.permissions.includes("manage_server"))) {
          sendJson(response, 403, { error: "Sunucuyu yönetme yetkisini yalnızca sunucu sahibi verebilir." });
          return;
        }
        if (serverRecord.roles.some((item) => item.id !== role.id &&
          item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
          sendJson(response, 409, { error: "Bu isimde bir rol zaten var." });
          return;
        }
        const previousRole = { name: role.name, color: role.color, permissions: role.permissions };
        role.name = name;
        role.color = color;
        role.permissions = [...new Set(permissions)];
        try {
          persistStore();
        } catch (error) {
          Object.assign(role, previousRole);
          throw error;
        }
        sendJson(response, 200, { role });
        return;
      }

      const roleIndex = serverRecord.roles.indexOf(role);
      const previousMemberRoles = serverRecord.memberRoles;
      serverRecord.roles.splice(roleIndex, 1);
      serverRecord.memberRoles = Object.fromEntries(
        Object.entries(previousMemberRoles).map(([memberId, roleIds]) =>
          [memberId, roleIds.filter((assignedId) => assignedId !== role.id)]),
      );
      try {
        persistStore();
      } catch (error) {
        serverRecord.roles.splice(roleIndex, 0, role);
        serverRecord.memberRoles = previousMemberRoles;
        throw error;
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    const memberRolesRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/members\/([\da-f-]{36})\/roles$/i);
    if (request.method === "PATCH" && memberRolesRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Üye rollerini değiştirmek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === memberRolesRoute[1]);
      if (!serverRecord ||
        (serverRecord.ownerId !== user.id &&
          (!user.servers.includes(serverRecord.id) || !hasServerPermission(serverRecord, user.id, "manage_roles")))) {
        sendJson(response, 403, { error: "Bu sunucuda üye rollerini değiştirme yetkin yok." });
        return;
      }
      ensureServerRoles(serverRecord);
      const member = store.users.find((item) =>
        item.id === memberRolesRoute[2] && item.servers.includes(serverRecord.id));
      if (!member) {
        sendJson(response, 404, { error: "Sunucu üyesi bulunamadı." });
        return;
      }
      if (member.id === serverRecord.ownerId) {
        sendJson(response, 400, { error: "Sunucu sahibinin rolleri değiştirilemez." });
        return;
      }
      const body = await readJson(request);
      if (!Array.isArray(body.roleIds) ||
        body.roleIds.some((roleId) => typeof roleId !== "string" ||
          roleId === "everyone" || !serverRecord.roles.some((role) => role.id === roleId && !role.isDefault) ||
          (serverRecord.ownerId !== user.id &&
            serverRecord.roles.some((role) => role.id === roleId && role.permissions.includes("manage_server"))))) {
        sendJson(response, 400, { error: "Üye rolleri geçersiz." });
        return;
      }
      const previousRoleIds = serverRecord.memberRoles[member.id];
      serverRecord.memberRoles[member.id] = [...new Set(body.roleIds)];
      try {
        persistStore();
      } catch (error) {
        if (previousRoleIds) serverRecord.memberRoles[member.id] = previousRoleIds;
        else delete serverRecord.memberRoles[member.id];
        throw error;
      }
      sendJson(response, 200, {
        member: { id: member.id, username: member.username, roleIds: serverRecord.memberRoles[member.id] },
      });
      return;
    }

    const memberModerationRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/members\/([\da-f-]{36})\/moderation$/i);
    if (memberModerationRoute && request.method === "GET") {
      const user = getUser(request);
      const serverRecord = store.servers.find((item) => item.id === memberModerationRoute[1]);
      const canModerate = serverRecord && user && [
        "manage_roles",
        "manage_nicknames",
        "kick_members",
        "ban_members",
      ].some((permission) => hasServerPermission(serverRecord, user.id, permission));
      if (!user || !canModerate) {
        sendJson(response, user ? 403 : 401, { error: "Üye moderasyon bilgilerini görme yetkin yok." });
        return;
      }
      const target = store.users.find((item) =>
        item.id === memberModerationRoute[2] && item.servers.includes(serverRecord.id));
      if (!target) {
        sendJson(response, 404, { error: "Sunucu üyesi bulunamadı." });
        return;
      }
      const roleIds = serverRecord.memberRoles?.[target.id] || [];
      const roles = (serverRecord.roles || []).filter((role) => roleIds.includes(role.id));
      const connections = serverConnections.get(serverRecord.id) || [];
      sendJson(response, 200, {
        member: {
          id: target.id,
          username: target.username,
          nickname: serverRecord.nicknames?.[target.id] || "",
          isOnline: Array.from(connections).some((connection) => connection.presenceUserId === target.id),
          roles: roles.map(({ id, name, color }) => ({ id, name, color })),
        },
      });
      return;
    }

    const memberActionRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/members\/([\da-f-]{36})(?:\/nickname)?$/i);
    const memberNicknameRoute = memberActionRoute && pathname.endsWith("/nickname");
    const memberBanRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/bans\/([\da-f-]{36})$/i);
    const serverBansRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/bans$/i);
    if (serverBansRoute && request.method === "GET") {
      const user = getUser(request);
      const serverRecord = store.servers.find((item) => item.id === serverBansRoute[1]);
      if (!user || !serverRecord || !hasServerPermission(serverRecord, user.id, "ban_members")) {
        sendJson(response, user ? 403 : 401, { error: "Yasaklı üyeleri görme yetkin yok." });
        return;
      }
      const bannedUsers = (serverRecord.bannedUserIds || [])
        .map((id) => store.users.find((item) => item.id === id))
        .filter(Boolean)
        .map(({ id, username }) => ({ id, username }));
      sendJson(response, 200, { bannedUsers });
      return;
    }
    if ((memberActionRoute && ["PATCH", "DELETE"].includes(request.method)) ||
      (memberBanRoute && ["POST", "DELETE"].includes(request.method))) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Sunucu üyelerini yönetmek için giriş yap." });
        return;
      }
      const serverId = (memberActionRoute || memberBanRoute)[1];
      const targetId = (memberActionRoute || memberBanRoute)[2];
      if (memberNicknameRoute && request.method !== "PATCH") {
        sendJson(response, 405, { error: "Takma ad yalnızca düzenlenebilir." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === serverId);
      const permission = memberNicknameRoute
        ? "manage_nicknames"
        : memberBanRoute ? "ban_members" : "kick_members";
      if (!serverRecord || !hasServerPermission(serverRecord, user.id, permission)) {
        sendJson(response, 403, { error: "Bu işlemi yapmak için gerekli sunucu iznin yok." });
        return;
      }
      const target = store.users.find((item) => item.id === targetId && item.servers.includes(serverId));
      const isUnban = Boolean(memberBanRoute && request.method === "DELETE");
      if (isUnban) {
        if (!serverRecord?.bannedUserIds?.includes(targetId)) {
          sendJson(response, 404, { error: "Yasaklı kullanıcı bulunamadı." });
          return;
        }
        serverRecord.bannedUserIds = serverRecord.bannedUserIds.filter((id) => id !== targetId);
        try {
          persistStore();
        } catch (error) {
          serverRecord.bannedUserIds.push(targetId);
          throw error;
        }
        sendJson(response, 200, { ok: true });
        return;
      }
      if (!target) {
        sendJson(response, 404, { error: "Sunucu üyesi bulunamadı." });
        return;
      }
      if (target.id === user.id || target.id === serverRecord.ownerId) {
        sendJson(response, 403, { error: "Kendini veya sunucu sahibini bu işlemle hedefleyemezsin." });
        return;
      }

      if (memberNicknameRoute) {
        const body = await readJson(request);
        const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
        if (nickname.length > 32) {
          sendJson(response, 400, { error: "Takma ad en fazla 32 karakter olabilir." });
          return;
        }
        const previousNickname = serverRecord.nicknames?.[targetId];
        serverRecord.nicknames ||= {};
        if (nickname) serverRecord.nicknames[targetId] = nickname;
        else delete serverRecord.nicknames[targetId];
        try {
          persistStore();
        } catch (error) {
          if (previousNickname === undefined) delete serverRecord.nicknames[targetId];
          else serverRecord.nicknames[targetId] = previousNickname;
          throw error;
        }
        publishServerMembers(serverId);
        sendJson(response, 200, { ok: true, nickname });
        return;
      }

      const previousServers = [...target.servers];
      const previousRoles = serverRecord.memberRoles?.[targetId];
      const previousNickname = serverRecord.nicknames?.[targetId];
      const previousBans = [...(serverRecord.bannedUserIds || [])];
      target.servers = target.servers.filter((id) => id !== serverId);
      if (serverRecord.memberRoles) delete serverRecord.memberRoles[targetId];
      if (serverRecord.nicknames) delete serverRecord.nicknames[targetId];
      if (memberBanRoute) {
        serverRecord.bannedUserIds ||= [];
        if (!serverRecord.bannedUserIds.includes(targetId)) serverRecord.bannedUserIds.push(targetId);
      }
      try {
        persistStore();
      } catch (error) {
        target.servers = previousServers;
        if (previousRoles) {
          serverRecord.memberRoles ||= {};
          serverRecord.memberRoles[targetId] = previousRoles;
        }
        if (previousNickname !== undefined) {
          serverRecord.nicknames ||= {};
          serverRecord.nicknames[targetId] = previousNickname;
        }
        serverRecord.bannedUserIds = previousBans;
        throw error;
      }
      for (const connection of serverConnections.get(serverId) || []) {
        if (connection.presenceUserId === targetId) connection.close(1008, memberBanRoute ? "Sunucudan yasaklandın" : "Sunucudan çıkarıldın");
      }
      publishServerMembers(serverId);
      sendJson(response, 200, { ok: true });
      return;
    }

    const serverRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})$/i);
    if (request.method === "DELETE" && serverRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Sunucuyu silmek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === serverRoute[1]);
      if (!serverRecord || serverRecord.ownerId !== user.id) {
        sendJson(response, 403, { error: "Bir sunucuyu yalnızca sahibi silebilir." });
        return;
      }
      const previousServers = store.servers;
      const previousMessages = store.messages;
      const previousMemberships = store.users.map((member) => [member, member.servers]);
      store.servers = previousServers.filter((item) => item.id !== serverRecord.id);
      store.messages = previousMessages.filter((message) => message.serverId !== serverRecord.id);
      for (const member of store.users) {
        member.servers = member.servers.filter((serverId) => serverId !== serverRecord.id);
      }
      try {
        persistStore();
      } catch (error) {
        store.servers = previousServers;
        store.messages = previousMessages;
        for (const [member, memberships] of previousMemberships) member.servers = memberships;
        throw error;
      }
      const roomPrefix = `${serverRecord.id}:`;
      for (const [roomId, room] of rooms) {
        if (!roomId.startsWith(roomPrefix)) continue;
        for (const connection of room.values()) connection.close(1001, "Sunucu silindi");
      }
      for (const [roomId, room] of chatRooms) {
        if (!roomId.startsWith(roomPrefix)) continue;
        for (const connection of room) connection.close(1001, "Sunucu silindi");
      }
      for (const connection of serverConnections.get(serverRecord.id) || []) {
        connection.close(1001, "Sunucu silindi");
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "PATCH" && serverRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Sunucu adını düzenlemek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === serverRoute[1]);
      if (!serverRecord || !hasServerPermission(serverRecord, user.id, "manage_server")) {
        sendJson(response, 403, { error: "Bu sunucuyu yönetme yetkin yok." });
        return;
      }
      const body = await readJson(request);
      const name = typeof body.name === "string" ? body.name.trim() : serverRecord.name;
      if (name.length < 2 || name.length > 48) {
        sendJson(response, 400, { error: "Sunucu adı 2-48 karakter olmalı." });
        return;
      }
      if (body.password !== undefined &&
        (typeof body.password !== "string" || (body.password.length > 0 &&
          (body.password.length < 8 || body.password.length > 128)))) {
        sendJson(response, 400, { error: "Sunucu şifresi boş olmalı veya 8-128 karakter olmalı." });
        return;
      }
      if (body.clearPassword !== undefined && typeof body.clearPassword !== "boolean") {
        sendJson(response, 400, { error: "Şifre kaldırma seçimi geçersiz." });
        return;
      }
      if (body.image !== undefined && body.image !== null) {
        if (typeof body.image !== "string" ||
          !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
          sendJson(response, 400, { error: "Sunucu görseli PNG, JPEG veya WebP olmalı." });
          return;
        }
        const imageBytes = Buffer.from(body.image.slice(body.image.indexOf(",") + 1), "base64");
        if (imageBytes.length > MAX_SERVER_IMAGE_BYTES) {
          sendJson(response, 400, { error: "Sunucu görseli en fazla 256 KB olabilir." });
          return;
        }
      }
      const previousSettings = {
        name: serverRecord.name,
        image: serverRecord.image,
        passwordHash: serverRecord.passwordHash,
        passwordSalt: serverRecord.passwordSalt,
      };
      serverRecord.name = name;
      if (body.image !== undefined) serverRecord.image = body.image || "";
      if (body.password) {
        serverRecord.passwordSalt = randomUUID();
        serverRecord.passwordHash = hashServerPassword(body.password, serverRecord.passwordSalt);
      } else if (body.clearPassword) {
        delete serverRecord.passwordSalt;
        delete serverRecord.passwordHash;
      }
      try {
        persistStore();
      } catch (error) {
        Object.assign(serverRecord, previousSettings);
        throw error;
      }
      sendJson(response, 200, { server: publicServer(serverRecord, user.id) });
      return;
    }

    const inviteRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/invite$/i);
    if (request.method === "POST" && inviteRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Davet kodu oluşturmak için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === inviteRoute[1]);
      if (!serverRecord) {
        sendJson(response, 404, { error: "Sunucu bulunamadı." });
        return;
      }
      const body = await readJson(request);
      const channel = body.channelId === undefined
        ? undefined
        : serverRecord.channels.find((item) => item.id === body.channelId);
      if ((body.channelId !== undefined && !channel) ||
        (channel
          ? !hasChannelPermission(serverRecord, channel, user.id, "create_invite")
          : !hasServerPermission(serverRecord, user.id, "create_invite"))) {
        sendJson(response, 403, { error: "Bu sunucu için davet oluşturma yetkin yok." });
        return;
      }
      const previousInviteCode = serverRecord.inviteCode;
      serverRecord.inviteCode = generateInviteCode();
      try {
        persistStore();
      } catch (error) {
        serverRecord.inviteCode = previousInviteCode;
        throw error;
      }
      sendJson(response, 200, { server: publicServer(serverRecord, user.id) });
      return;
    }

    const channelLayoutRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/layout$/i);
    if (request.method === "PATCH" && channelLayoutRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kanalları taşımak için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === channelLayoutRoute[1]);
      if (!serverRecord || !hasServerPermission(serverRecord, user.id, "move_channels")) {
        sendJson(response, 403, { error: "Bu sunucuda kanal ve kategori taşıma yetkin yok." });
        return;
      }
      const body = await readJson(request);
      const categoryIds = serverRecord.categories || [];
      const channels = serverRecord.channels || [];
      const visibleChannelIds = new Set(publicServer(serverRecord, user.id).channels.map((channel) => channel.id));
      if (!Array.isArray(body.categoryIds) || body.categoryIds.length !== categoryIds.length ||
        new Set(body.categoryIds).size !== categoryIds.length ||
        body.categoryIds.some((id) => !categoryIds.some((category) => category.id === id)) ||
        !Array.isArray(body.channels) || body.channels.length !== visibleChannelIds.size ||
        new Set(body.channels.map((channel) => channel?.id)).size !== visibleChannelIds.size ||
        body.channels.some((channel) => !channel || typeof channel.id !== "string" ||
          !visibleChannelIds.has(channel.id) ||
          (channel.categoryId !== null && !categoryIds.some((category) => category.id === channel.categoryId)))) {
        sendJson(response, 400, { error: "Sunucu oda veya kategori sıralaması geçersiz." });
        return;
      }
      const previousCategories = serverRecord.categories;
      const previousChannels = serverRecord.channels;
      const previousCategoryIds = new Map(channels.map((channel) => [channel.id, channel.categoryId]));
      const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
      const visibleSlots = channels
        .map((channel, index) => visibleChannelIds.has(channel.id) ? index : -1)
        .filter((index) => index >= 0);
      const reorderedVisibleChannels = body.channels.map(({ id, categoryId }) => {
        const channel = channelsById.get(id);
        if (categoryId === null) delete channel.categoryId;
        else channel.categoryId = categoryId;
        return channel;
      });
      serverRecord.categories = body.categoryIds.map((id) =>
        categoryIds.find((category) => category.id === id));
      serverRecord.channels = [...channels];
      visibleSlots.forEach((slot, index) => {
        serverRecord.channels[slot] = reorderedVisibleChannels[index];
      });
      try {
        persistStore();
      } catch (error) {
        serverRecord.categories = previousCategories;
        serverRecord.channels = previousChannels;
        for (const channel of channels) {
          if (previousCategoryIds.get(channel.id) === undefined) delete channel.categoryId;
          else channel.categoryId = previousCategoryIds.get(channel.id);
        }
        throw error;
      }
      sendJson(response, 200, { server: publicServer(serverRecord, user.id) });
      return;
    }

    const categoryRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/categories(?:\/([\da-f-]{36}))?$/i);
    if (categoryRoute && ["POST", "PATCH", "DELETE"].includes(request.method)) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kategori yönetmek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === categoryRoute[1]);
      if (!serverRecord || !hasServerPermission(serverRecord, user.id, "manage_channels")) {
        sendJson(response, 403, { error: "Bu sunucuda kategori yönetme yetkin yok." });
        return;
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name.length < 2 || name.length > 32) {
          sendJson(response, 400, { error: "Kategori adı 2-32 karakter olmalı." });
          return;
        }
        serverRecord.categories ||= [];
        if (serverRecord.categories.length >= 20) {
          sendJson(response, 400, { error: "Bir sunucuda en fazla 20 kategori olabilir." });
          return;
        }
        if (serverRecord.categories.some((category) =>
          category.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
          sendJson(response, 409, { error: "Bu isimde bir kategori zaten var." });
          return;
        }
        const category = { id: randomUUID(), name };
        serverRecord.categories.push(category);
        try {
          persistStore();
        } catch (error) {
          serverRecord.categories.pop();
          throw error;
        }
        sendJson(response, 201, { server: publicServer(serverRecord, user.id) });
        return;
      }
      const category = serverRecord.categories?.find((item) => item.id === categoryRoute[2]);
      if (!category) {
        sendJson(response, 404, { error: "Kategori bulunamadı." });
        return;
      }
      if (request.method === "DELETE") {
        const previousCategories = serverRecord.categories;
        const previousChannelCategories = serverRecord.channels.map((channel) => channel.categoryId);
        serverRecord.categories = previousCategories.filter((item) => item.id !== category.id);
        for (const channel of serverRecord.channels) {
          if (channel.categoryId === category.id) delete channel.categoryId;
        }
        try {
          persistStore();
        } catch (error) {
          serverRecord.categories = previousCategories;
          serverRecord.channels.forEach((channel, index) => {
            if (previousChannelCategories[index] === undefined) delete channel.categoryId;
            else channel.categoryId = previousChannelCategories[index];
          });
          throw error;
        }
        sendJson(response, 200, { server: publicServer(serverRecord, user.id) });
        return;
      }
      const body = await readJson(request);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2 || name.length > 32) {
        sendJson(response, 400, { error: "Kategori adı 2-32 karakter olmalı." });
        return;
      }
      if (serverRecord.categories.some((item) =>
        item.id !== category.id &&
        item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
        sendJson(response, 409, { error: "Bu isimde bir kategori zaten var." });
        return;
      }
      const previousName = category.name;
      category.name = name;
      try {
        persistStore();
      } catch (error) {
        category.name = previousName;
        throw error;
      }
      sendJson(response, 200, { server: publicServer(serverRecord, user.id) });
      return;
    }

    const channelRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/channels$/i);
    if (request.method === "POST" && channelRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kanal eklemek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === channelRoute[1]);
      if (!serverRecord || !hasServerPermission(serverRecord, user.id, "manage_channels")) {
        sendJson(response, 403, { error: "Bu sunucuda kanal yönetme yetkin yok." });
        return;
      }
      const body = await readJson(request);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const type = body.type === undefined ? "voice" : body.type;
      const categoryId = body.categoryId === undefined || body.categoryId === null ? null : body.categoryId;
      if (name.length < 2 || name.length > 32) {
        sendJson(response, 400, { error: "Kanal adı 2-32 karakter olmalı." });
        return;
      }
      if (!["voice", "text"].includes(type)) {
        sendJson(response, 400, { error: "Kanal türü ses veya metin olmalı." });
        return;
      }
      if (categoryId !== null && !serverRecord.categories?.some((category) => category.id === categoryId)) {
        sendJson(response, 400, { error: "Kanal kategorisi bulunamadı." });
        return;
      }
      if (serverRecord.channels.length >= 50) {
        sendJson(response, 400, { error: "Bir sunucuda en fazla 50 kanal olabilir." });
        return;
      }
      if (serverRecord.channels.some((item) =>
        (item.type || "voice") === type &&
        item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
        sendJson(response, 409, { error: "Bu kanalı zaten eklemişsin." });
        return;
      }
      const channel = { id: randomUUID(), name, type, permissionOverwrites: {} };
      if (categoryId) channel.categoryId = categoryId;
      serverRecord.channels.push(channel);
      try {
        persistStore();
      } catch (error) {
        serverRecord.channels.pop();
        throw error;
      }
      sendJson(response, 201, { server: publicServer(serverRecord, user.id) });
      return;
    }

    const channelPermissionsRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/channels\/([\da-f-]{36})\/permissions$/i);
    if (channelPermissionsRoute && ["GET", "PATCH"].includes(request.method)) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kanal izinlerini yönetmek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === channelPermissionsRoute[1]);
      const channel = serverRecord?.channels.find((item) => item.id === channelPermissionsRoute[2]);
      if (!serverRecord || !channel || !canManageChannelPermissions(serverRecord, channel, user.id)) {
        sendJson(response, 403, { error: "Bu kanalın izinlerini yönetme yetkin yok." });
        return;
      }
      if (request.method === "GET") {
        ensureServerRoles(serverRecord);
        sendJson(response, 200, {
          roles: serverRecord.roles.map(({ id, name, isDefault }) => ({ id, name, isDefault: Boolean(isDefault) })),
          permissions: CHANNEL_PERMISSION_DEFINITIONS,
          overwrites: channel.permissionOverwrites || {},
        });
        return;
      }
      const body = await readJson(request);
      const role = serverRecord.roles?.find((item) => item.id === body.roleId);
      if (!role || !body.overrides || typeof body.overrides !== "object" || Array.isArray(body.overrides) ||
        Object.entries(body.overrides).some(([permission, state]) =>
          !Object.hasOwn(CHANNEL_PERMISSION_DEFINITIONS, permission) ||
          !["allow", "deny", "inherit"].includes(state))) {
        sendJson(response, 400, { error: "Kanal izinleri veya rol geçersiz." });
        return;
      }
      const previousOverwrites = channel.permissionOverwrites;
      const overwrites = { ...(previousOverwrites || {}) };
      const roleOverrides = {};
      for (const [permission, state] of Object.entries(body.overrides)) {
        if (state !== "inherit") roleOverrides[permission] = state;
      }
      if (Object.keys(roleOverrides).length) overwrites[role.id] = roleOverrides;
      else delete overwrites[role.id];
      channel.permissionOverwrites = overwrites;
      try {
        persistStore();
      } catch (error) {
        if (previousOverwrites) channel.permissionOverwrites = previousOverwrites;
        else delete channel.permissionOverwrites;
        throw error;
      }
      sendJson(response, 200, { ok: true, overwrites });
      return;
    }

    const namedChannelRoute = pathname.match(/^\/api\/servers\/([\da-f-]{36})\/channels\/([\da-f-]{36})$/i);
    if (["PATCH", "DELETE"].includes(request.method) && namedChannelRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Kanalı yönetmek için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === namedChannelRoute[1]);
      const channel = serverRecord?.channels.find((item) => item.id === namedChannelRoute[2]);
      if (!serverRecord || !channel || !canManageChannel(serverRecord, channel, user.id)) {
        sendJson(response, 403, { error: "Bu sunucuda kanal yönetme yetkin yok." });
        return;
      }
      if (request.method === "DELETE") {
        const previousChannels = serverRecord.channels;
        const previousMessages = store.messages;
        serverRecord.channels = previousChannels.filter((item) => item.id !== channel.id);
        store.messages = previousMessages.filter((message) =>
          message.serverId !== serverRecord.id || message.channelId !== channel.id);
        try {
          persistStore();
        } catch (error) {
          serverRecord.channels = previousChannels;
          store.messages = previousMessages;
          throw error;
        }
        const roomId = `${serverRecord.id}:${channel.id}`;
        for (const connection of rooms.get(roomId)?.values() || []) {
          connection.close(1001, "Kanal silindi");
        }
        for (const connection of chatRooms.get(roomId) || []) {
          connection.close(1001, "Kanal silindi");
        }
        sendJson(response, 200, { server: publicServer(serverRecord, user.id) });
        return;
      }
      const body = await readJson(request);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const categoryId = body.categoryId === undefined
        ? channel.categoryId || null
        : body.categoryId;
      if (name.length < 2 || name.length > 32) {
        sendJson(response, 400, { error: "Oda adı 2-32 karakter olmalı." });
        return;
      }
      if (categoryId !== null && !serverRecord.categories?.some((item) => item.id === categoryId)) {
        sendJson(response, 400, { error: "Kanal kategorisi bulunamadı." });
        return;
      }
      if (serverRecord.channels.some((item) =>
        (item.type || "voice") === (channel.type || "voice") &&
        item.id !== channel.id && item.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
        sendJson(response, 409, { error: "Bu sunucuda aynı türde ve isimde bir kanal zaten var." });
        return;
      }
      const previousName = channel.name;
      const previousCategoryId = channel.categoryId;
      channel.name = name;
      if (categoryId) channel.categoryId = categoryId;
      else delete channel.categoryId;
      try {
        persistStore();
      } catch (error) {
        channel.name = previousName;
        if (previousCategoryId) channel.categoryId = previousCategoryId;
        else delete channel.categoryId;
        throw error;
      }
      sendJson(response, 200, { server: publicServer(serverRecord, user.id) });
      return;
    }

    if (request.method === "POST" && pathname === "/api/servers") {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Sunucu kurmak için kayıt olup giriş yap." });
        return;
      }
      const body = await readJson(request);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2 || name.length > 48) {
        sendJson(response, 400, { error: "Sunucu adı 2-48 karakter olmalı." });
        return;
      }
      if (user.servers.length >= 20) {
        sendJson(response, 400, { error: "En fazla 20 sunucu kurup kaydedebilirsin." });
        return;
      }
      const defaultCategoryId = randomUUID();
      const newServer = {
        id: randomUUID(),
        name,
        inviteCode: generateInviteCode(),
        ownerId: user.id,
        nicknames: {},
        bannedUserIds: [],
        categories: [{ id: defaultCategoryId, name: "Kanallar" }],
        channels: [
          { id: randomUUID(), name: "Genel", type: "voice", categoryId: defaultCategoryId },
          { id: randomUUID(), name: "genel-sohbet", type: "text", categoryId: defaultCategoryId },
        ],
        roles: [{
          id: "everyone",
          name: "Varsayılan izinler",
          color: "#949ba4",
          permissions: [],
          isDefault: true,
        }],
        memberRoles: {},
      };
      store.servers.push(newServer);
      user.servers.push(newServer.id);
      try {
        persistStore();
      } catch (error) {
        store.servers.pop();
        user.servers.pop();
        throw error;
      }
      sendJson(response, 201, { server: publicServer(newServer, user.id) });
      return;
    }

    const leaveServerRoute = pathname.match(/^\/api\/servers\/([a-f\d-]{36})\/leave$/i);
    if (request.method === "POST" && leaveServerRoute) {
      const user = getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Sunucudan ayrılmak için giriş yap." });
        return;
      }
      const serverRecord = store.servers.find((item) => item.id === leaveServerRoute[1]);
      if (!serverRecord || !user.servers.includes(serverRecord.id)) {
        sendJson(response, 404, { error: "Üyesi olduğun sunucu bulunamadı." });
        return;
      }
      if (serverRecord.ownerId === user.id) {
        sendJson(response, 409, { error: "Sunucu sahibi ayrılamaz. Önce sahipliği devretmeli veya sunucuyu silmelisin." });
        return;
      }
      const previousServers = [...user.servers];
      user.servers = user.servers.filter((id) => id !== serverRecord.id);
      try { persistStore(); } catch (error) { user.servers = previousServers; throw error; }
      for (const connection of serverConnections.get(serverRecord.id) || []) {
        if (connection.presenceUserId === user.id) connection.close(1008, "Sunucudan ayrıldı");
      }
      publishServerMembers(serverRecord.id);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && pathname === "/api/servers/join") {
      const body = await readJson(request);
      const code = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";
      const resolved = findServerByInviteOrName(code);
      if (!resolved.server) {
        sendJson(response, resolved.status || 400, { error: resolved.error });
        return;
      }
      const serverRecord = resolved.server;
      const user = getUser(request);
      if (user && serverRecord.bannedUserIds?.includes(user.id)) {
        sendJson(response, 403, { error: "Bu sunucudan yasaklandığın için tekrar katılamazsın." });
        return;
      }
      if (user && !user.servers.includes(serverRecord.id)) {
        user.servers.push(serverRecord.id);
        try {
          persistStore();
        } catch (error) {
          user.servers.pop();
          throw error;
        }
        publishServerMembers(serverRecord.id);
      }
      sendJson(response, 200, { server: publicServer(serverRecord, user?.id) });
      return;
    }

    sendJson(response, 404, { error: "API adresi bulunamadı." });
  }

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");
    if (requestUrl.pathname.startsWith("/api/")) {
      handleApi(request, response, requestUrl).catch((error) => {
        if (response.headersSent || response.destroyed) return;
        console.error("API isteği başarısız:", error);
        sendJson(response, error.status || 500, {
          error: error.status ? error.message : "Sunucu hatası. Lütfen tekrar dene.",
        });
      });
      return;
    }

    const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
    const filePath = path.resolve(publicDirectory, relativePath);
    if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, contents) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      response.end(contents);
    });
  });
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const chatWebSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  const presenceWebSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  const directMessageWebSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  webSocketServers = [
    webSocketServer,
    chatWebSocketServer,
    presenceWebSocketServer,
    directMessageWebSocketServer,
  ];

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url, "http://localhost");
    if (!["/signal", "/chat", "/presence", "/dm"].includes(pathname)) {
      socket.destroy();
      return;
    }
    const targetServer = pathname === "/chat"
      ? chatWebSocketServer
      : pathname === "/presence"
        ? presenceWebSocketServer
        : pathname === "/dm"
          ? directMessageWebSocketServer
          : webSocketServer;
    targetServer.handleUpgrade(request, socket, head, (webSocket) => {
      targetServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (webSocket, request) => {
    const parameters = new URL(request.url, "http://localhost").searchParams;
    const serverId = parameters.get("server");
    const channelId = parameters.get("channel");
    let roomId = (parameters.get("room") || "").trim().slice(0, 64);
    if (serverId || channelId) {
      const serverRecord = store.servers.find((item) => item.id === serverId);
      const channel = serverRecord?.channels.find((item) => item.id === channelId);
      if (!serverRecord || !channel || channel.type === "text") {
        webSocket.close(1008, "Sunucu veya kanal bulunamadı");
        return;
      }
      if (["view_channel", "connect"].some((permission) =>
        channel.permissionOverwrites?.everyone?.[permission] === "deny")) {
        webSocket.channelAccessTimer = setTimeout(() => {
          if (!webSocket.presenceUserId) webSocket.close(1008, "Bu ses kanalına katılma yetkin yok");
        }, 1500);
      }
      roomId = `${serverId}:${channelId}`;
    } else if (!/^[\p{L}\p{N}_-]+$/u.test(roomId)) {
      webSocket.close(1008, "Geçersiz oda kodu");
      return;
    }

    const name = (parameters.get("name") || "Misafir").trim().slice(0, 32) || "Misafir";
    let room = rooms.get(roomId);
    if (!room) {
      room = new Map();
      rooms.set(roomId, room);
    }
    if (room.size >= 12) {
      webSocket.close(1013, "Oda dolu");
      return;
    }

    const clientId = randomUUID();
    webSocket.roomId = roomId;
    webSocket.clientId = clientId;
    webSocket.displayName = name;
    webSocket.channelId = channelId;
    webSocket.isAlive = true;
    webSocket.on("pong", () => {
      webSocket.isAlive = true;
    });

    webSocket.send(JSON.stringify({
      type: "welcome",
      clientId,
      peers: Array.from(room, ([id, peer]) => ({ id, name: peer.displayName })),
    }));

    for (const peer of room.values()) {
      peer.send(JSON.stringify({ type: "peer-joined", peer: { id: clientId, name } }));
    }
    room.set(clientId, webSocket);
    if (serverId) registerServerConnection(webSocket, serverId, undefined, "voice", false);
    webSocket.on("message", (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        webSocket.close(1007, "Geçersiz mesaj");
        return;
      }

      if (message?.type === "presence-auth") {
        const user = getUserFromToken(message.token);
        if (serverId && user && !webSocket.presenceUserId) {
          webSocket.sessionTokenHash = createHash("sha256").update(message.token).digest("hex");
          const serverRecord = store.servers.find((item) => item.id === serverId);
          const channel = serverRecord?.channels.find((item) => item.id === channelId);
          if (serverRecord?.bannedUserIds?.includes(user.id) || !user.servers.includes(serverId)) {
            webSocket.close(1008, serverRecord?.bannedUserIds?.includes(user.id)
              ? "Sunucudan yasaklandın"
              : "Bu sunucunun üyesi değilsin");
            return;
          }
          if (!serverRecord || !channel ||
            !hasChannelPermission(serverRecord, channel, user.id, "view_channel") ||
            !hasChannelPermission(serverRecord, channel, user.id, "connect")) {
            webSocket.close(1008, "Bu ses kanalına katılma yetkin yok");
            return;
          }
          clearTimeout(webSocket.channelAccessTimer);
          // A user may have only one active voice connection in this server.
          // Terminate stale connections so reconnects cannot leave ghost peers.
          for (const other of Array.from(serverConnections.get(serverId) || [])) {
            if (other !== webSocket && other.presenceKind === "voice" &&
                other.presenceUserId === user.id && other.readyState !== WebSocket.CLOSED) {
              other.terminate();
            }
          }
          setConnectionUser(webSocket, user.id);
          // A voice-state packet may arrive before authentication; publish it now.
          publishServerMembers(serverId);
        }
        return;
      }

      if (message?.type === "voice-state") {
        if (
          typeof message.microphoneMuted !== "boolean" ||
          typeof message.soundMuted !== "boolean" ||
          typeof message.sharing !== "boolean" ||
          typeof message.camera !== "boolean"
        ) {
          return;
        }
        webSocket.voiceState = { microphoneMuted: message.microphoneMuted, soundMuted: message.soundMuted, sharing: message.sharing };
        if (webSocket.presenceServerId && webSocket.presenceUserId) publishServerMembers(webSocket.presenceServerId);
        const serialized = JSON.stringify({
          type: "voice-state",
          peerId: clientId,
          microphoneMuted: message.microphoneMuted,
          soundMuted: message.soundMuted,
          sharing: message.sharing,
          camera: message.camera,
        });
        for (const peer of room.values()) {
          if (peer !== webSocket && peer.readyState === WebSocket.OPEN) peer.send(serialized);
        }
        return;
      }

      if (
        message?.type !== "signal" ||
        typeof message.to !== "string" ||
        !["offer", "answer", "candidate"].includes(message.data?.type)
      ) {
        return;
      }
      const recipient = room.get(message.to);
      if (recipient?.readyState === WebSocket.OPEN) {
        recipient.send(JSON.stringify({ type: "signal", from: clientId, data: message.data }));
      }
    });

    webSocket.on("close", () => {
      clearTimeout(webSocket.channelAccessTimer);
      room.delete(clientId);
      unregisterServerConnection(webSocket);
      for (const peer of room.values()) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: "peer-left", peerId: clientId }));
        }
      }
      if (room.size === 0) rooms.delete(roomId);
    });
  });

  chatWebSocketServer.on("connection", (webSocket, request) => {
    const parameters = new URL(request.url, "http://localhost").searchParams;
    const serverId = parameters.get("server");
    const channelId = parameters.get("channel");
    const serverRecord = store.servers.find((item) => item.id === serverId);
    const channel = channelId === "general"
      ? undefined
      : serverRecord?.channels.find((item) => item.id === channelId);
    if (
      !serverRecord ||
      !matchesInviteCode(serverRecord, parameters.get("invite")) ||
      (channelId !== "general" && !channel)
      || (channel && channel.type && channel.type !== "text")
    ) {
      webSocket.close(1008, "Sunucu veya sohbet kanalı bulunamadı");
      return;
    }

    const name = (parameters.get("name") || "Misafir").trim().slice(0, 32) || "Misafir";
    const roomId = `${serverId}:${channelId}`;
    function currentChatMessages() {
      return store.messages
        .filter((message) => message.serverId === serverId && message.channelId === channelId)
        .map((message) => {
          const sender = message.senderId
            ? store.users.find((user) => user.id === message.senderId) : null;
          return sender ? { ...message, name: sender.username, avatar: sender.avatar || "" } : message;
        });
    }
    let room = chatRooms.get(roomId);
    if (!room) {
      room = new Set();
      chatRooms.set(roomId, room);
    }
    webSocket.isAlive = true;
    webSocket.messageTimes = [];
    webSocket.requiresChannelAuth = Boolean(channel && Object.keys(channel.permissionOverwrites || {}).length);
    if (!webSocket.requiresChannelAuth) room.add(webSocket);
    if (webSocket.requiresChannelAuth) {
      webSocket.channelAccessTimer = setTimeout(() => {
        if (webSocket.presenceUserId) return;
        if (!hasChannelPermission(serverRecord, channel, undefined, "view_channel")) {
          webSocket.close(1008, "Bu kanalı görüntüleme yetkin yok");
          return;
        }
        room.add(webSocket);
        registerServerConnection(webSocket, serverId, undefined, "chat", false);
        webSocket.send(JSON.stringify({
          type: "chat-history",
          messages: currentChatMessages(),
          members: getServerMembers(serverId),
          voiceParticipants: getServerVoiceParticipants(serverId),
        }));
        publishServerMembers(serverId, webSocket);
      }, 1500);
    }
    webSocket.on("pong", () => {
      webSocket.isAlive = true;
    });

    if (!webSocket.requiresChannelAuth) {
      registerServerConnection(webSocket, serverId, undefined, "chat", false);
      webSocket.send(JSON.stringify({
        type: "chat-history",
        messages: currentChatMessages(),
        members: getServerMembers(serverId),
        voiceParticipants: getServerVoiceParticipants(serverId),
      }));
      publishServerMembers(serverId, webSocket);
    }

    webSocket.on("message", (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        webSocket.close(1007, "Geçersiz mesaj");
        return;
      }

      if (message?.type === "presence-auth") {
        const user = getUserFromToken(message.token);
        if (user?.servers.includes(serverId) && webSocket.presenceUserId !== user.id) {
          webSocket.sessionTokenHash = createHash("sha256").update(message.token).digest("hex");
          if (channel && (!hasChannelPermission(serverRecord, channel, user.id, "view_channel") ||
            !hasChannelPermission(serverRecord, channel, user.id, "send_messages"))) {
            webSocket.close(1008, "Bu kanalı görüntüleme yetkin yok");
            return;
          }
          clearTimeout(webSocket.channelAccessTimer);
          if (webSocket.presenceServerId) {
            setConnectionUser(webSocket, user.id);
            publishServerMembers(serverId);
          } else {
            if (webSocket.requiresChannelAuth) room.add(webSocket);
            registerServerConnection(webSocket, serverId, user.id, "chat", false);
          }
          if (webSocket.requiresChannelAuth) {
            webSocket.send(JSON.stringify({
              type: "chat-history",
              messages: currentChatMessages(),
              members: getServerMembers(serverId),
              voiceParticipants: getServerVoiceParticipants(serverId),
            }));
            publishServerMembers(serverId, webSocket);
          }
        }
        return;
      }

      const text = typeof message?.text === "string" ? message.text.trim() : "";
      if (message?.type !== "chat-message" || !text || text.length > 2000) return;
      if (channel &&
        !hasChannelPermission(serverRecord, channel, webSocket.presenceUserId, "send_messages")) {
        webSocket.send(JSON.stringify({ type: "chat-error", message: "Bu kanala mesaj gönderme yetkin yok." }));
        return;
      }

      const now = Date.now();
      webSocket.messageTimes = webSocket.messageTimes.filter((timestamp) => now - timestamp < 10_000);
      if (webSocket.messageTimes.length >= 8) {
        webSocket.send(JSON.stringify({ type: "chat-error", message: "Biraz yavaşla ve tekrar dene." }));
        return;
      }
      webSocket.messageTimes.push(now);

      const chatMessage = {
        id: randomUUID(),
        serverId,
        channelId,
        senderId: webSocket.presenceUserId || null,
        name: webSocket.presenceUserId
          ? store.users.find((user) => user.id === webSocket.presenceUserId)?.username || name
          : name,
        text,
        createdAt: new Date(now).toISOString(),
      };
      const previousMessages = store.messages;
      const conversation = previousMessages.filter((item) =>
        item.serverId === serverId && item.channelId === channelId);
      const removeCount = Math.max(0, conversation.length + 1 - 100);
      const removedIds = new Set(conversation.slice(0, removeCount).map((item) => item.id));
      store.messages = previousMessages.filter((item) => !removedIds.has(item.id));
      store.messages.push(chatMessage);
      try {
        persistStore();
      } catch (error) {
        store.messages = previousMessages;
        console.error("Sohbet mesajı kaydedilemedi:", error);
        webSocket.send(JSON.stringify({ type: "chat-error", message: "Mesaj kaydedilemedi. Tekrar dene." }));
        return;
      }

      const serialized = JSON.stringify({ type: "chat-message", message: chatMessage });
      for (const recipient of room) {
        if (recipient.readyState === WebSocket.OPEN) recipient.send(serialized);
      }
      if (chatMessage.senderId) {
        const mentionedUsers = store.users.filter((user) => {
          if (user.id === chatMessage.senderId || !user.servers.includes(serverId)) return false;
          const escapedUsername = user.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(^|[^\\p{L}\\p{N}_-])@${escapedUsername}(?=$|[^\\p{L}\\p{N}_-])`, "iu")
            .test(chatMessage.text);
        });
        for (const mentionedUser of mentionedUsers) {
          notifyUser(mentionedUser.id, {
            type: "mention",
            title: "Bir mesajda senden bahsedildi",
            body: `${chatMessage.name}: ${text.slice(0, 120)}`,
            senderId: chatMessage.senderId,
            sourceId: chatMessage.id,
            serverId,
            channelId,
          });
        }
      }
    });

    webSocket.on("close", () => {
      clearTimeout(webSocket.channelAccessTimer);
      room.delete(webSocket);
      unregisterServerConnection(webSocket);
      if (room.size === 0) chatRooms.delete(roomId);
    });
  });

  presenceWebSocketServer.on("connection", (webSocket) => {
    webSocket.isAlive = true;
    webSocket.on("pong", () => {
      webSocket.isAlive = true;
    });
    webSocket.on("message", (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        webSocket.close(1007, "Geçersiz mesaj");
        return;
      }
      if (!webSocket.presenceUserId) {
        if (message?.type !== "presence-auth") return;
        const user = getUserFromToken(message.token);
        if (!user) {
          webSocket.close(1008, "Oturum bulunamadı");
          return;
        }
        webSocket.sessionTokenHash = createHash("sha256").update(message.token).digest("hex");
        webSocket.presenceKind = "presence";
        webSocket.send(JSON.stringify({ type: "presence-ready" }));
        setConnectionUser(webSocket, user.id);
        webSocket.send(JSON.stringify({ type: "online-users", users: getOnlineUsers() }));
        return;
      }
      const userId = webSocket.presenceUserId;
      if (message?.type === "server-subscribe") {
        const serverId = typeof message.serverId === "string" ? message.serverId : "";
        const serverRecord = store.servers.find((item) => item.id === serverId);
        const user = store.users.find((item) => item.id === userId);
        if (!serverRecord || !user?.servers.includes(serverId)) {
          webSocket.send(JSON.stringify({
            type: "server-members-error",
            serverId,
            message: "Bu sunucunun üyesi değilsin.",
          }));
          return;
        }
        webSocket.subscribedServerId = serverId;
        webSocket.send(JSON.stringify({
          type: "server-members",
          serverId,
          members: getServerMembers(serverId),
          voiceParticipants: getServerVoiceParticipants(serverId),
        }));
        return;
      }
      if (message?.type === "server-unsubscribe") {
        const serverId = typeof message.serverId === "string" ? message.serverId : "";
        if (!serverId || webSocket.subscribedServerId === serverId) {
          webSocket.subscribedServerId = undefined;
        }
        return;
      }
      if (message?.type === "call-invite") {
        if (typeof message.toUserId !== "string" ||
          typeof message.callId !== "string" || !/^[\da-f-]{36}$/i.test(message.callId) ||
          !areFriends(userId, message.toUserId)) {
          webSocket.send(JSON.stringify({ type: "call-invite-result", callId: message.callId, delivered: false }));
          return;
        }
        const targetConnections = Array.from(userConnections.get(message.toUserId) || [])
          .filter((connection) => connection.presenceKind === "presence" && connection.readyState === WebSocket.OPEN);
        for (const connection of targetConnections) {
          connection.send(JSON.stringify({
            type: "call-invite",
            callId: message.callId,
            fromUserId: userId,
            fromName: store.users.find((item) => item.id === userId)?.username || "Arkadaşın",
          }));
        }
        webSocket.send(JSON.stringify({
          type: "call-invite-result",
          callId: message.callId,
          delivered: targetConnections.length > 0,
        }));
        return;
      }
      if (message?.type === "call-response" &&
        typeof message.toUserId === "string" &&
        typeof message.callId === "string" &&
        /^[\da-f-]{36}$/i.test(message.callId) &&
        typeof message.accepted === "boolean" &&
        areFriends(userId, message.toUserId)) {
        for (const connection of userConnections.get(message.toUserId) || []) {
          if (connection.presenceKind === "presence" && connection.readyState === WebSocket.OPEN) {
            connection.send(JSON.stringify({
              type: "call-response",
              callId: message.callId,
              fromUserId: userId,
              accepted: message.accepted,
            }));
          }
        }
      }
    });
    webSocket.on("close", () => setConnectionUser(webSocket, undefined));
  });

  directMessageWebSocketServer.on("connection", (webSocket, request) => {
    const recipientId = new URL(request.url, "http://localhost").searchParams.get("user");
    webSocket.isAlive = true;
    webSocket.messageTimes = [];
    webSocket.on("pong", () => {
      webSocket.isAlive = true;
    });
    webSocket.on("message", (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        webSocket.close(1007, "Geçersiz mesaj");
        return;
      }

      if (!webSocket.presenceUserId) {
        if (message?.type !== "presence-auth") return;
        const user = getUserFromToken(message.token);
        if (!user || !canDirectMessage(user.id, recipientId)) {
          webSocket.close(1008, "Bu kullanıcıyla özel mesajlaşamazsın");
          return;
        }
        webSocket.sessionTokenHash = createHash("sha256").update(message.token).digest("hex");
        webSocket.presenceKind = "direct-message";
        webSocket.directMessageRoomId = [user.id, recipientId].sort().join(":");
        setConnectionUser(webSocket, user.id);
        let room = directMessageRooms.get(webSocket.directMessageRoomId);
        if (!room) {
          room = new Set();
          directMessageRooms.set(webSocket.directMessageRoomId, room);
        }
        room.add(webSocket);
        const messages = store.directMessages
          .filter((item) => item.conversationId === webSocket.directMessageRoomId)
          .slice(-100).map((item) => {
            const sender = store.users.find((user) => user.id === item.senderId);
            return sender ? { ...item, name: sender.username, avatar: sender.avatar || "" } : item;
          });
        webSocket.send(JSON.stringify({ type: "dm-history", messages }));
        return;
      }

      const text = typeof message?.text === "string" ? message.text.trim() : "";
      if (message?.type !== "dm-message" || !text || text.length > 2000) return;
      if (!canDirectMessage(webSocket.presenceUserId, recipientId)) {
        webSocket.close(1008, "Bu kullanıcının özel mesajları kapalı veya kullanıcı engellendi");
        return;
      }
      const now = Date.now();
      webSocket.messageTimes = webSocket.messageTimes.filter((timestamp) => now - timestamp < 10_000);
      if (webSocket.messageTimes.length >= 8) {
        webSocket.send(JSON.stringify({ type: "dm-error", message: "Biraz yavaşla ve tekrar dene." }));
        return;
      }
      webSocket.messageTimes.push(now);

      const directMessage = {
        id: randomUUID(),
        conversationId: webSocket.directMessageRoomId,
        senderId: webSocket.presenceUserId,
        recipientId,
        name: store.users.find((item) => item.id === webSocket.presenceUserId).username,
        text,
        createdAt: new Date(now).toISOString(),
      };
      const previousMessages = store.directMessages;
      const conversation = previousMessages.filter((item) => item.conversationId === directMessage.conversationId);
      const removeCount = Math.max(0, conversation.length + 1 - 100);
      const removedIds = new Set(conversation.slice(0, removeCount).map((item) => item.id));
      store.directMessages = previousMessages.filter((item) => !removedIds.has(item.id));
      store.directMessages.push(directMessage);
      try {
        persistStore();
      } catch (error) {
        store.directMessages = previousMessages;
        console.error("Özel mesaj kaydedilemedi:", error);
        webSocket.send(JSON.stringify({ type: "dm-error", message: "Mesaj kaydedilemedi. Tekrar dene." }));
        return;
      }
      const serialized = JSON.stringify({ type: "dm-message", message: {
        ...directMessage,
        avatar: store.users.find((item) => item.id === directMessage.senderId)?.avatar || "",
      } });
      for (const recipient of directMessageRooms.get(webSocket.directMessageRoomId) || []) {
        if (recipient.readyState === WebSocket.OPEN) recipient.send(serialized);
      }
      notifyUser(recipientId, {
        type: "direct-message",
        title: "Yeni özel mesaj",
        body: `${directMessage.name}: ${text.slice(0, 120)}`,
        senderId: directMessage.senderId,
        sourceId: directMessage.conversationId,
      });
    });
    webSocket.on("close", () => {
      const roomId = webSocket.directMessageRoomId;
      if (roomId) {
        const room = directMessageRooms.get(roomId);
        room?.delete(webSocket);
        if (room?.size === 0) directMessageRooms.delete(roomId);
      }
      setConnectionUser(webSocket, undefined);
    });
  });

  const heartbeat = setInterval(() => {
    for (const webSocket of [
      ...webSocketServer.clients,
      ...chatWebSocketServer.clients,
      ...presenceWebSocketServer.clients,
      ...directMessageWebSocketServer.clients,
    ]) {
      if (!webSocket.isAlive) {
        webSocket.terminate();
        continue;
      }
      webSocket.isAlive = false;
      webSocket.ping();
    }
  }, 30_000);
  heartbeat.unref();
  server.on("close", () => clearInterval(heartbeat));

  return { server, webSocketServer };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  // Never silently create an empty account database on ephemeral Railway storage.
  if (process.env.RAILWAY_ENVIRONMENT && !process.env.DATA_DIR) {
    console.error("KALICI VERI HATASI: DATA_DIR tanımlı değil. Railway Volume bağlayıp DATA_DIR=/app/data ayarlayın.");
    process.exit(1);
  }
  const dataDirectory = process.env.DATA_DIR || (typeof process.pkg === "undefined"
    ? path.join(__dirname, "data")
    : path.join(path.dirname(process.execPath), "data"));
  const { server } = createServer({ dataFile: path.join(dataDirectory, "store.json") });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} zaten kullanımda. Önce çalışan sunucuyu kapat veya PORT=3001 npm start komutuyla farklı port kullan.`);
      process.exitCode = 1;
      return;
    }
    console.error("Sunucu başlatılamadı:", error);
    process.exitCode = 1;
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`VC hazır: http://localhost:${port}`);
  });
}

module.exports = { createServer };