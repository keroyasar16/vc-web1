const landing = document.querySelector("#landing");
const roomView = document.querySelector("#room");
const chatView = document.querySelector("#chat-view");
const chatMessages = document.querySelector("#chat-messages");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const workspaceLayout = document.querySelector(".discord-app-layout");
const serverMembersPanel = document.querySelector("#server-members");
const sidebarResizeHandle = document.querySelector("#sidebar-resize-handle");
const onlineMembersList = document.querySelector("#online-members");
const offlineMembersList = document.querySelector("#offline-members");
const topbar = document.querySelector(".topbar");
const joinForm = document.querySelector("#join-form");
const roomCodeInput = document.querySelector("#room-code");
const joinButton = joinForm.querySelector("button");
const joinButtonLabel = document.querySelector("#join-button-label");
const grid = document.querySelector("#participant-grid");
const roomNotice = document.querySelector("#room-notice");
const toast = document.querySelector("#toast");
const muteButton = document.querySelector("#mute-button");
const muteLabel = document.querySelector("#mute-label");
const soundMuteButton = document.querySelector("#sound-mute-button");
const soundMuteLabel = document.querySelector("#sound-mute-label");
const shareButton = document.querySelector("#share-button");
const shareLabel = document.querySelector("#share-label");
const shareQuality = document.querySelector("#share-quality");
const cameraButton = document.querySelector("#camera-button");
const cameraLabel = document.querySelector("#camera-label");
const cameraQuality = document.querySelector("#camera-quality");
const authForm = document.querySelector("#auth-form");
const authOptions = document.querySelector("#auth-options");
const dashboard = document.querySelector("#dashboard");
const dashboardContent = document.querySelector(".dashboard-content");
const friendsView = document.querySelector("#friends-view");
const dmView = document.querySelector("#dm-view");
const dmMessages = document.querySelector("#dm-messages");
const dmForm = document.querySelector("#dm-form");
const dmInput = document.querySelector("#dm-input");
const dmSend = document.querySelector("#dm-send");
const serverList = document.querySelector("#server-list");
const guestServerList = document.querySelector("#guest-server-list");
const createServerDialog = document.querySelector("#create-server-dialog");
const createCategoryDialog = document.querySelector("#create-category-dialog");
const createCategoryForm = document.querySelector("#create-category-form");
const createChannelDialog = document.querySelector("#create-channel-dialog");
const createChannelForm = document.querySelector("#create-channel-form");
const renameDialog = document.querySelector("#rename-dialog");
const renameForm = document.querySelector("#rename-form");
const serverSettingsDialog = document.querySelector("#server-settings-dialog");
const serverSettingsForm = document.querySelector("#server-settings-form");
const serverRolesDialog = document.querySelector("#server-roles-dialog");
const serverRoleForm = document.querySelector("#server-role-form");
const userSettingsDialog = document.querySelector("#user-settings-dialog");
const userSettingsForm = document.querySelector("#user-settings-form");
const profileEditDialog = document.querySelector("#profile-edit-dialog");
const profileEditForm = document.querySelector("#profile-edit-form");
const audioInputDevice = document.querySelector("#audio-input-device");
const audioOutputDevice = document.querySelector("#audio-output-device");
const audioInputVolume = document.querySelector("#audio-input-volume");
const audioOutputVolume = document.querySelector("#audio-output-volume");

let socket;
let localStream;
let rawMicrophoneStream;
let screenTrack;
let cameraTrack;
let voiceAudioContext;
let voiceGainNode;
let voiceMicrophoneSource;
let speakingMonitorTimer;
let microphoneTestStream;
let microphoneTestContext;
let microphoneTestFrame;
let clientId;
let currentRoom;
let displayName;
let currentServer;
let currentChannel;
let roomInWorkspace = false;
let voiceActive = false;
let soundMuted = false;
let soundMutePreviousMicEnabled;
let chatSocket;
let activeChat;
let chatReady = false;
let serverMembers = [];
let serverVoiceParticipants = [];
let serverVoiceParticipantsServerId;
let globallyOnlineUsers = [];
let accountUser;
let selectedServer;
let friendData = { friends: [], incomingRequests: [], outgoingRequests: [], blockedUserIds: [] };
let directMessageUsers = [];
let notifications = [];
let notificationSearchTimer;
let notificationSearchSequence = 0;
let unreadNotificationCount = 0;
let friendsTab = "online";
let friendsRefreshTimer;
let presenceSocket;
let presenceReady = false;
let subscribedPresenceServerId;
let presenceReconnectTimer;
let directMessageSocket;
let activeDirectMessage;
let notificationAudioContext;
let serverRoleData = { roles: [], members: [] };
let editingServerRole;
let channelPermissionData;
const pendingCalls = new Map();
let authToken = localStorage.getItem("oda.authToken");
let authMode = "login";
let reconnecting = false;
let toastTimer;
const peers = new Map();
const participantNames = new Map();
const participantStates = new Map();
const participantStreams = new Map();
const participantVideoTracks = new Map();
const speakingMonitors = new Map();
const speakingParticipants = new Set();
const servers = new Map();
let pendingRename;
let resizingSidebar = false;
const collapsedCategories = new Map();
let draggedLayoutItem;
let memberContextMenu;
let profileDialog;
let bannedMembersDialog;
let moderationDialog;
const ignoredUserIds = new Set();

function restoreIgnoredUsers() {
  ignoredUserIds.clear();
  if (!accountUser) return;
  const saved = localStorage.getItem(`oda.ignoredUsers.${accountUser.id}`);
  if (!saved) return;
  try {
    const userIds = JSON.parse(saved);
    if (!Array.isArray(userIds) || userIds.some((userId) => typeof userId !== "string")) {
      throw new Error("Yok sayılan kullanıcı listesi geçersiz.");
    }

    function setParticipantVideoTrack(id, kind, track) {
      const tracks = participantVideoTracks.get(id) || {};
      if (track) tracks[kind] = track;
      else delete tracks[kind];
      if (Object.keys(tracks).length) participantVideoTracks.set(id, tracks);
      else participantVideoTracks.delete(id);
      renderParticipant(id, participantNames.get(id) || displayName || "Katılımcı", participantStreams.get(id));
    }
    for (const userId of userIds) ignoredUserIds.add(userId);
  } catch (error) {
    console.error("Yok sayılan kullanıcılar yüklenemedi:", error);
    showToast("Yok sayılan kullanıcı tercihleri yüklenemedi.");
  }
}

function getSavedSidebarWidth() {
  const savedWidth = Number(localStorage.getItem("oda.serverSidebarWidth"));
  return Number.isFinite(savedWidth) && savedWidth >= 180 && savedWidth <= 420 ? savedWidth : 250;
}

function setSidebarWidth(width, save = false) {
  const membersWidth = serverMembersPanel.hidden ? 0 : 240;
  const availableWidth = workspaceLayout.clientWidth;
  const maxWidth = availableWidth > 0
    ? Math.max(180, Math.min(420, availableWidth - 72 - 6 - membersWidth - 320))
    : 420;
  const nextWidth = Math.round(Math.max(180, Math.min(maxWidth, width)));
  workspaceLayout.style.setProperty("--server-sidebar-width", `${nextWidth}px`);
  sidebarResizeHandle.setAttribute("aria-valuenow", String(nextWidth));
  if (save) localStorage.setItem("oda.serverSidebarWidth", String(nextWidth));
  return nextWidth;
}

setSidebarWidth(getSavedSidebarWidth());

function prepareNotificationAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;
  notificationAudioContext ||= new AudioContextConstructor();
  if (notificationAudioContext.state === "suspended") {
    notificationAudioContext.resume().catch((error) =>
      console.warn("Bildirim sesi etkinleştirilemedi:", error));
  }
}

document.addEventListener("pointerdown", prepareNotificationAudio, { passive: true });
document.addEventListener("keydown", prepareNotificationAudio);

function playNotificationSound() {
  if (!notificationAudioContext || notificationAudioContext.state !== "running") return;
  const startTime = notificationAudioContext.currentTime;
  const oscillator = notificationAudioContext.createOscillator();
  const gain = notificationAudioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, startTime);
  oscillator.frequency.setValueAtTime(988, startTime + 0.09);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
  oscillator.connect(gain);
  gain.connect(notificationAudioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.29);
}

document.querySelector("#guild-home").addEventListener("click", () => {
  showFriendsView();
  acknowledgeNotifications().catch((error) => showToast(error.message));
});
document.querySelector("#friends-sidebar-home").addEventListener("click", () => {
  showFriendsView();
  acknowledgeNotifications().catch((error) => showToast(error.message));
});
document.querySelectorAll("[data-friends-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    friendsTab = button.dataset.friendsTab;
    document.querySelectorAll("[data-friends-tab]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderFriends();
  });
});
document.querySelector("#friend-list-search").addEventListener("input", renderFriends);
document.querySelector("#friends-search").addEventListener("input", () => {
  renderFriendSearchResults();
});
document.querySelector("#back-to-friends").addEventListener("click", showFriendsView);
document.querySelector("#friend-add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await apiRequest("/api/friends/requests", {
      method: "POST",
      body: { username: form.elements.username.value.trim() },
    });
    form.reset();
    showToast("Arkadaşlık isteği gönderildi");
    await loadFriends();
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
  }
});

function showFriendsView() {
  if (!accountUser) {
    showToast("Arkadaşlarını görmek için giriş yap.");
    return;
  }
  if (activeChat) closeChatConnection();
  closeDirectMessageConnection();
  activeDirectMessage = undefined;
  activeChat = undefined;
  friendsTab = "online";
  document.querySelectorAll("[data-friends-tab]").forEach((tab) => {
    const active = tab.dataset.friendsTab === friendsTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  dashboard.classList.add("is-friends");
  document.querySelector("#friends-sidebar").hidden = false;
  friendsView.hidden = false;
  dmView.hidden = true;
  dashboardContent.hidden = true;
  roomView.hidden = true;
  chatView.hidden = true;
  setMembersPanelVisible(false);
  unsubscribeFromServerPresence();
  document.querySelector(".workspace-location span:last-child").textContent = "Arkadaşlar";
  document.querySelector("#friends-sidebar-home").classList.toggle("is-active", !friendsView.hidden);
  loadFriends().catch((error) => showToast(error.message));
  window.clearInterval(friendsRefreshTimer);
  friendsRefreshTimer = window.setInterval(() => {
    if (!friendsView.hidden) loadFriends().catch((error) => console.warn("Arkadaş durumu yenilenemedi:", error));
  }, 15000);
}

async function loadFriends() {
  const [result, directMessages] = await Promise.all([
    apiRequest("/api/friends"),
    apiRequest("/api/dms"),
  ]);
  friendData = result;
  directMessageUsers = directMessages.users;
  if (activeDirectMessage) {
    activeDirectMessage = friendData.friends.find((friend) => friend.id === activeDirectMessage.id) ||
      directMessageUsers.find((friend) => friend.id === activeDirectMessage.id) || activeDirectMessage;
  }
  renderFriends();
}

function renderFriends() {
  const list = document.querySelector("#friends-list");
  const activity = document.querySelector("#friends-activity");
  const query = document.querySelector("#friend-list-search").value.trim().toLocaleLowerCase("tr");
  const heading = document.querySelector("#friends-list-title");
  const addForm = document.querySelector("#friend-add-form");
  addForm.hidden = friendsTab !== "add";
  list.replaceChildren();
  activity.replaceChildren();
  let rows = [];

  if (friendsTab === "pending") {
    rows = [
      ...friendData.incomingRequests.map((item) => ({ ...item.user, requestId: item.id, direction: "incoming" })),
      ...friendData.outgoingRequests.map((item) => ({ ...item.user, requestId: item.id, direction: "outgoing" })),
    ];
    heading.textContent = `BEKLEYEN — ${rows.length}`;
  } else {
    const friends = friendsTab === "online"
      ? friendData.friends.filter((friend) => friend.isOnline)
      : friendData.friends;
    rows = friends.filter((friend) => friend.username.toLocaleLowerCase("tr").includes(query));
    heading.textContent = `${friendsTab === "online" ? "ÇEVRİM İÇİ" : "TÜMÜ"} — ${rows.length}`;
  }

  if (friendsTab === "add") {
    heading.textContent = "ARKADAŞ EKLE";
    list.classList.add("is-empty");
    const hint = document.createElement("p");
    hint.className = "friends-empty-state";
    hint.textContent = "Arkadaşlık isteği göndermek için kullanıcı adını yukarıya yaz.";
    list.append(hint);
  } else if (rows.length === 0) {
    list.classList.add("is-empty");
    const empty = document.createElement("p");
    empty.className = "friends-empty-state";
    empty.textContent = friendsTab === "pending"
      ? "Bekleyen arkadaşlık isteği yok."
      : friendsTab === "online"
        ? "Şu anda çevrimiçi arkadaşın yok."
        : "Henüz arkadaş eklemedin.";
    list.append(empty);
  } else {
    list.classList.remove("is-empty");
    for (const friend of rows) {
      const row = document.createElement("article");
      row.className = "friend-row";
      if (!friend.direction) {
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `${friend.username} ile özel mesaj başlat`);
        row.addEventListener("click", (event) => {
          if (!event.target.closest("button")) openDirectMessage(friend);
        });
        row.addEventListener("keydown", (event) => {
          if (event.target === row && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openDirectMessage(friend);
          }
        });
      }
      const avatar = document.createElement("span");
      avatar.className = `friend-avatar${friend.isOnline ? " is-online" : ""}`;
      avatar.textContent = getInitials(friend.username);
      const identity = document.createElement("div");
      identity.className = "friend-identity";
      const username = document.createElement("strong");
      username.textContent = friend.username;
      const status = document.createElement("span");
      status.textContent = friend.direction === "outgoing" ? "İstek gönderildi" :
        friend.direction === "incoming" ? "Gelen istek" :
          friend.isOnline ? "Çevrim içi" : "Çevrim dışı";
      identity.append(username, status);
      const actions = document.createElement("div");
      actions.className = "friend-row-actions";
      if (friend.direction === "incoming") {
        actions.append(
          createFriendAction("Kabul et", () => handleFriendRequest(friend.requestId, "accept")),
          createFriendAction("Reddet", () => handleFriendRequest(friend.requestId, "decline")),
        );
      } else if (friend.direction === "outgoing") {
        actions.append(createFriendAction("İptal et", () => cancelFriendRequest(friend.requestId)));
      } else {
        actions.append(createFriendAction("Kaldır", () => removeFriend(friend)));
      }
      row.append(avatar, identity, actions);
      list.append(row);
    }
  }

  const onlineFriends = friendData.friends.filter((friend) => friend.isOnline);
  if (onlineFriends.length === 0) {
    const art = document.createElement("div");
    art.className = "friends-activity-art";
    art.setAttribute("aria-hidden", "true");
    art.textContent = "♫";
    const title = document.createElement("strong");
    title.textContent = "Şimdilik sessiz";
    const description = document.createElement("p");
    description.textContent = "Arkadaşların çevrimiçi olduğunda aktiviteleri burada görünür.";
    activity.append(art, title, description);
  } else {
    for (const friend of onlineFriends) {
      const item = document.createElement("div");
      item.className = "friend-activity-row";
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `${friend.username} ile özel mesaj başlat`);
      item.addEventListener("click", () => openDirectMessage(friend));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDirectMessage(friend);
        }
      });
      const avatar = document.createElement("span");
      avatar.className = "friend-avatar is-online";
      avatar.textContent = getInitials(friend.username);
      const name = document.createElement("strong");
      name.textContent = friend.username;
      const status = document.createElement("span");
      status.textContent = "Çevrim içi";
      item.append(avatar, name, status);
      activity.append(item);
    }
  }
  document.querySelector("#friends-sidebar-home").classList.toggle("is-active", !friendsView.hidden);
  renderDirectMessagesSidebar();
  renderFriendSearchResults();
}

function renderDirectMessagesSidebar() {
  const list = document.querySelector("#direct-messages-list");
  list.replaceChildren();
  if (directMessageUsers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "friends-sidebar-empty";
    empty.textContent = "Henüz bir direkt mesajın yok.";
    list.append(empty);
    return;
  }
  for (const friend of directMessageUsers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "direct-message-link";
    button.classList.toggle("is-active", activeDirectMessage?.id === friend.id && !dmView.hidden);
    button.addEventListener("click", () => openDirectMessage(friend));
    const avatar = document.createElement("span");
    avatar.className = `friend-avatar${friend.isOnline ? " is-online" : ""}`;
    avatar.textContent = getInitials(friend.username);
    const name = document.createElement("span");
    name.textContent = friend.username;
    button.append(avatar, name);
    list.append(button);
  }
}

let friendSearchResults = [];

function renderFriendSearchResults() {
  const input = document.querySelector("#friends-search");
  const results = document.querySelector("#friends-search-results");
  const query = input.value.trim();
  results.hidden = !query;
  window.clearTimeout(notificationSearchTimer);
  const sequence = ++notificationSearchSequence;
  friendSearchResults = [];
  renderFriendSearchMatches(query.toLocaleLowerCase("tr"));
  if (query.length < 2) return;
  notificationSearchTimer = window.setTimeout(async () => {
    try {
      const { users } = await apiRequest(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (sequence !== notificationSearchSequence ||
        input.value.trim().toLocaleLowerCase("tr") !== query.toLocaleLowerCase("tr")) return;
      friendSearchResults = users;
      renderFriendSearchMatches(query.toLocaleLowerCase("tr"));
    } catch (error) {
      if (sequence === notificationSearchSequence) showToast(error.message);
    }
  }, 180);
}

function renderFriendSearchMatches(query) {
  const input = document.querySelector("#friends-search");
  const results = document.querySelector("#friends-search-results");
  results.replaceChildren();
  if (!query) return;
  const localMatches = friendData.friends.filter((friend) =>
    friend.username.toLocaleLowerCase("tr").includes(query));
  const matchesById = new Map([...localMatches, ...friendSearchResults].map((friend) => [friend.id, friend]));
  const matches = [...matchesById.values()];
  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "friends-sidebar-empty";
    empty.textContent = "Kullanıcı bulunamadı.";
    results.append(empty);
    return;
  }
  for (const friend of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "direct-message-link";
    const isFriend = friend.isFriend || friendData.friends.some((item) => item.id === friend.id);
    button.disabled = !isFriend && !friend.canMessage;
    button.addEventListener("click", () => {
      if (button.disabled) return;
      input.value = "";
      renderFriendSearchResults();
      openDirectMessage(friend);
    });
    const avatar = document.createElement("span");
    avatar.className = `friend-avatar${friend.isOnline ? " is-online" : ""}`;
    avatar.textContent = getInitials(friend.username);
    const name = document.createElement("span");
    name.textContent = friend.username;
    button.append(avatar, name);
    if (!isFriend && !friend.canMessage) {
      const status = document.createElement("span");
      status.className = "direct-message-locked";
      status.textContent = "Mesajlara kapalı";
      button.append(status);
    }
    results.append(button);
  }
}

function openDirectMessage(friend, initialMessage = "") {
  const isFriend = friendData.friends.some((item) => item.id === friend?.id);
  const hasPermission = directMessageUsers.some((item) => item.id === friend?.id) || friend?.canMessage;
  if (!accountUser || !friend?.id || (!isFriend && !hasPermission)) return;
  closeDirectMessageConnection();
  activeDirectMessage = friend;
  friendsView.hidden = true;
  dashboardContent.hidden = true;
  roomView.hidden = true;
  chatView.hidden = true;
  dmView.hidden = false;
  document.querySelector("#friends-sidebar").hidden = false;
  document.querySelector("#friends-sidebar-home").classList.remove("is-active");
  document.querySelector(".workspace-location span:last-child").textContent = friend.username;
  document.querySelector("#dm-title").textContent = friend.username;
  document.querySelector("#dm-avatar").textContent = getInitials(friend.username);
  document.querySelector("#dm-status").textContent = friend.isOnline ? "Çevrim içi" : "Özel mesaj";
  dmMessages.replaceChildren();
  dmInput.value = initialMessage;
  dmInput.disabled = true;
  dmSend.disabled = true;
  renderDirectMessagesSidebar();
  connectDirectMessage(friend);
  const conversationId = [accountUser.id, friend.id].sort().join(":");
  acknowledgeNotifications(notifications
    .filter((item) => item.type === "direct-message" && item.sourceId === conversationId && !item.readAt)
    .map((item) => item.id))
    .catch((error) => showToast(error.message));
}

function connectDirectMessage(friend) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connection = new WebSocket(`${protocol}//${location.host}/dm?user=${encodeURIComponent(friend.id)}`);
  directMessageSocket = connection;
  connection.addEventListener("open", () => {
    if (directMessageSocket === connection && authToken) {
      connection.send(JSON.stringify({ type: "presence-auth", token: authToken }));
    }
  });
  connection.addEventListener("message", ({ data }) => {
    if (directMessageSocket !== connection) return;
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.warn("Özel mesaj yanıtı okunamadı:", error);
      return;
    }
    if (message.type === "dm-history") {
      dmMessages.replaceChildren();
      for (const item of message.messages) appendDirectMessage(item);
      if (message.messages.length === 0) {
        const empty = document.createElement("p");
        empty.className = "dm-empty-state";
        empty.textContent = `Bu, ${friend.username} ile olan mesajlarının başlangıcı.`;
        dmMessages.append(empty);
      }
      dmInput.disabled = false;
      dmSend.disabled = false;
      if (dmInput.value.trim()) dmForm.requestSubmit();
      dmInput.focus();
    } else if (message.type === "dm-message") {
      appendDirectMessage(message.message);
    } else if (message.type === "dm-error") {
      showToast(message.message);
    }
  });
  connection.addEventListener("close", () => {
    if (directMessageSocket !== connection) return;
    directMessageSocket = undefined;
    if (activeDirectMessage?.id === friend.id) {
      dmInput.disabled = true;
      dmSend.disabled = true;
      document.querySelector("#dm-status").textContent = "Bağlantı kesildi. Tekrar açarak yeniden dene.";
    }
  });
  connection.addEventListener("error", () => {
    if (directMessageSocket === connection) showToast("Özel mesaj bağlantısı kurulamadı.");
  });
}

function closeDirectMessageConnection() {
  if (!directMessageSocket) return;
  const connection = directMessageSocket;
  directMessageSocket = undefined;
  connection.close(1000, "Özel mesaj kapatıldı");
}

function appendDirectMessage(message) {
  dmMessages.querySelector(".dm-empty-state")?.remove();
  const article = document.createElement("article");
  article.className = `chat-message${message.senderId === accountUser?.id ? " is-own-message" : ""}`;
  const avatar = document.createElement("span");
  avatar.className = "chat-avatar";
  avatar.textContent = getInitials(message.name);
  const content = document.createElement("div");
  content.className = "chat-message-content";
  const metadata = document.createElement("div");
  metadata.className = "chat-message-meta";
  const author = document.createElement("strong");
  author.textContent = message.name;
  const timestamp = document.createElement("time");
  timestamp.dateTime = message.createdAt;
  timestamp.textContent = new Date(message.createdAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const text = document.createElement("p");
  text.textContent = message.text;
  metadata.append(author, timestamp);
  content.append(metadata, text);
  article.append(avatar, content);
  dmMessages.append(article);
  dmMessages.scrollTop = dmMessages.scrollHeight;
}

dmForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = dmInput.value.trim();
  if (!text) return;
  if (directMessageSocket?.readyState !== WebSocket.OPEN || dmInput.disabled) {
    showToast("Özel mesaj bağlantısı hazır değil.");
    return;
  }
  directMessageSocket.send(JSON.stringify({ type: "dm-message", text }));
  dmInput.value = "";
});

function connectPresence() {
  if (!accountUser || !authToken || (presenceSocket &&
    [WebSocket.CONNECTING, WebSocket.OPEN].includes(presenceSocket.readyState))) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connection = new WebSocket(`${protocol}//${location.host}/presence`);
  presenceSocket = connection;
  presenceReady = false;
  subscribedPresenceServerId = undefined;
  connection.addEventListener("open", () => {
    if (presenceSocket === connection && authToken) {
      connection.send(JSON.stringify({ type: "presence-auth", token: authToken }));
    }
  });
  connection.addEventListener("message", ({ data }) => {
    if (presenceSocket !== connection) return;
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.warn("Çevrim içi durumu yanıtı okunamadı:", error);
      return;
    }
    if (message.type === "presence-update") {
      const friend = friendData.friends.find((item) => item.id === message.userId);
      if (friend) {
        friend.isOnline = message.isOnline;
        if (activeDirectMessage?.id === friend.id) {
          activeDirectMessage.isOnline = message.isOnline;
          document.querySelector("#dm-status").textContent = message.isOnline ? "Çevrim içi" : "Özel mesaj";
        }
        renderFriends();
      }
    } else if (message.type === "presence-ready") {
      presenceReady = true;
      subscribeToSelectedServerPresence();
    } else if (message.type === "notification") {
      if (!message.notification?.id || notifications.some((item) => item.id === message.notification.id)) return;
      playNotificationSound();
      notifications.push(message.notification);
      unreadNotificationCount += 1;
      updateNotificationBadge();
      const notification = message.notification;
      const activeConversationId = activeDirectMessage && accountUser
        ? [accountUser.id, activeDirectMessage.id].sort().join(":")
        : "";
      const isVisible = notification.type === "direct-message" &&
        notification.sourceId === activeConversationId && !dmView.hidden ||
        notification.type === "mention" && notification.serverId === currentServer?.id &&
        notification.channelId === currentChannel?.id && !chatView.hidden;
      if (isVisible) {
        acknowledgeNotifications([notification.id]).catch((error) => showToast(error.message));
      } else {
        showToast(notification.title);
      }
    } else if (message.type === "online-users") {
      globallyOnlineUsers = Array.isArray(message.users) ? message.users : [];
      renderServerMembers();
    } else if (message.type === "server-members") {
      updateServerMemberPresence(message);
    } else if (message.type === "server-members-error") {
      if (message.serverId === selectedServer?.id) showToast(message.message);
    } else if (message.type === "call-invite") {
      if (!friendData.friends.some((friend) => friend.id === message.fromUserId)) return;
      const accepted = window.confirm(`${message.fromName} seninle sesli arama başlatmak istiyor. Katılmak ister misin?`);
      if (connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify({
          type: "call-response",
          toUserId: message.fromUserId,
          callId: message.callId,
          accepted,
        }));
      }
      if (accepted) joinDirectCallRoom(message.callId);
    } else if (message.type === "call-invite-result") {
      const pendingCall = pendingCalls.get(message.callId);
      if (!pendingCall || message.delivered) return;
      window.clearTimeout(pendingCall.timer);
      pendingCalls.delete(message.callId);
      showToast(`${pendingCall.friend.username} şu anda çevrim içi değil`);
    } else if (message.type === "call-response") {
      const pendingCall = pendingCalls.get(message.callId);
      if (!pendingCall) return;
      window.clearTimeout(pendingCall.timer);
      pendingCalls.delete(message.callId);
      if (message.accepted) joinDirectCallRoom(message.callId);
      else showToast(`${pendingCall.friend.username} aramayı kabul etmedi`);
    }
  });
  connection.addEventListener("close", () => {
    if (presenceSocket !== connection) return;
    presenceSocket = undefined;
    presenceReady = false;
    subscribedPresenceServerId = undefined;
    if (accountUser && authToken) {
      window.clearTimeout(presenceReconnectTimer);
      presenceReconnectTimer = window.setTimeout(connectPresence, 2000);
    }
  });
  connection.addEventListener("error", () => connection.close());
}

function closePresenceConnection() {
  window.clearTimeout(presenceReconnectTimer);
  for (const pendingCall of pendingCalls.values()) window.clearTimeout(pendingCall.timer);
  pendingCalls.clear();
  presenceReady = false;
  subscribedPresenceServerId = undefined;
  if (!presenceSocket) return;
  const connection = presenceSocket;
  presenceSocket = undefined;
  connection.close(1000, "Oturum kapatıldı");
}

function subscribeToSelectedServerPresence() {
  const server = selectedServer || currentServer;
  if (!accountUser || !server || dashboard.classList.contains("is-friends") ||
    !presenceReady || presenceSocket?.readyState !== WebSocket.OPEN ||
    subscribedPresenceServerId === server.id) return;
  if (subscribedPresenceServerId) {
    presenceSocket.send(JSON.stringify({
      type: "server-unsubscribe",
      serverId: subscribedPresenceServerId,
    }));
  }
  subscribedPresenceServerId = server.id;
  presenceSocket.send(JSON.stringify({ type: "server-subscribe", serverId: server.id }));
}

function unsubscribeFromServerPresence() {
  if (presenceReady && presenceSocket?.readyState === WebSocket.OPEN && subscribedPresenceServerId) {
    presenceSocket.send(JSON.stringify({
      type: "server-unsubscribe",
      serverId: subscribedPresenceServerId,
    }));
  }
  subscribedPresenceServerId = undefined;
}

function startDirectCall(friend) {
  if (!friend?.isOnline || presenceSocket?.readyState !== WebSocket.OPEN) {
    showToast("Arama başlatmak için çevrim içi olup hazır olmalısın");
    return;
  }
  const callId = crypto.randomUUID();
  const timer = window.setTimeout(() => {
    if (!pendingCalls.has(callId)) return;
    pendingCalls.delete(callId);
    showToast(`${friend.username} aramaya yanıt vermedi`);
  }, 30_000);
  pendingCalls.set(callId, { friend, timer });
  presenceSocket.send(JSON.stringify({ type: "call-invite", toUserId: friend.id, callId }));
  showToast(`${friend.username} kullanıcısına arama isteği gönderildi`);
}

function joinDirectCallRoom(callId) {
  const name = accountUser?.username || displayName || joinForm.elements.name.value.trim();
  if (voiceActive) leaveRoom();
  enterVoiceRoom({ name, room: `call-${callId}` });
}

function createFriendAction(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

async function handleFriendRequest(requestId, action) {
  try {
    await apiRequest(`/api/friends/requests/${requestId}`, { method: "PATCH", body: { action } });
    await loadFriends();
    showToast(action === "accept" ? "Arkadaşlık isteği kabul edildi" : "Arkadaşlık isteği reddedildi");
  } catch (error) {
    showToast(error.message);
  }
}

async function cancelFriendRequest(requestId) {
  try {
    await apiRequest(`/api/friends/requests/${requestId}`, { method: "DELETE" });
    await loadFriends();
  } catch (error) {
    showToast(error.message);
  }
}

async function removeFriend(friend) {
  try {
    await apiRequest(`/api/friends/${friend.id}`, { method: "DELETE" });
    await loadFriends();
    showToast(`${friend.username} arkadaşlarından kaldırıldı`);
  } catch (error) {
    showToast(error.message);
  }
}

sidebarResizeHandle.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch" || window.innerWidth <= 760) return;
  event.preventDefault();
  resizingSidebar = true;
  sidebarResizeHandle.setPointerCapture(event.pointerId);
  workspaceLayout.classList.add("is-resizing-sidebar");
});

sidebarResizeHandle.addEventListener("pointermove", (event) => {
  if (!resizingSidebar) return;
  const bounds = workspaceLayout.getBoundingClientRect();
  setSidebarWidth(event.clientX - bounds.left - 72);
});

function stopSidebarResize() {
  if (!resizingSidebar) return;
  resizingSidebar = false;
  workspaceLayout.classList.remove("is-resizing-sidebar");
  setSidebarWidth(parseFloat(getComputedStyle(workspaceLayout).getPropertyValue("--server-sidebar-width")), true);
}

sidebarResizeHandle.addEventListener("pointerup", stopSidebarResize);
sidebarResizeHandle.addEventListener("pointercancel", stopSidebarResize);
sidebarResizeHandle.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const currentWidth = parseFloat(getComputedStyle(workspaceLayout).getPropertyValue("--server-sidebar-width"));
  setSidebarWidth(currentWidth + (event.key === "ArrowRight" ? 16 : -16), true);
});

roomCodeInput.addEventListener("input", () => {
  joinButtonLabel.textContent = roomCodeInput.value.trim() ? "Odaya katıl" : "Yeni oda oluştur";
});

document.querySelector("#login-tab").addEventListener("click", () => setAuthMode("login"));
document.querySelector("#register-tab").addEventListener("click", () => setAuthMode("register"));

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  const identityLabel = document.querySelector("#auth-identity-label");
  const usernameInput = document.querySelector("#auth-username");
  const usernameLabel = document.querySelector("#auth-username-label");
  identityLabel.textContent = registering ? "E-posta" : "E-posta veya kullanıcı adı";
  document.querySelector("#auth-email").type = registering ? "email" : "text";
  document.querySelector("#auth-email").placeholder = registering
    ? "ornek@posta.com"
    : "E-posta veya eski kullanıcı adı";
  document.querySelector("#auth-email").autocomplete = registering ? "email" : "username";
  usernameInput.hidden = !registering;
  usernameLabel.hidden = !registering;
  usernameInput.required = registering;
  document.querySelector("#login-tab").classList.toggle("is-active", !registering);
  document.querySelector("#register-tab").classList.toggle("is-active", registering);
  document.querySelector("#login-tab").setAttribute("aria-selected", String(!registering));
  document.querySelector("#register-tab").setAttribute("aria-selected", String(registering));
  document.querySelector("#auth-submit span").textContent = registering ? "Hesap oluştur" : "Giriş yap";
  document.querySelector("#auth-password").autocomplete = registering ? "new-password" : "current-password";
  document.querySelector("#password-hint").textContent = registering ? "En az 8 karakter" : "";
  clearAuthError();
}

function showAuthError(message) {
  clearAuthError();
  const error = document.createElement("p");
  error.className = "account-error";
  error.setAttribute("role", "alert");
  error.textContent = message;
  authForm.after(error);
}

function clearAuthError() {
  document.querySelector(".account-error")?.remove();
}

async function apiRequest(path, { method = "GET", body } = {}) {
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Sunucu eski sürümde çalışıyor veya API yanıtı geçersiz. Sunucuyu yeniden başlatıp sayfayı yenile.");
  }
  if (!response.ok) {
    const error = new Error(result.error || "İstek tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return result;
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = document.querySelector("#auth-submit");
  submitButton.disabled = true;
  clearAuthError();
  try {
    const result = await apiRequest(`/api/${authMode === "register" ? "register" : "login"}`, {
      method: "POST",
      body: {
        email: authForm.elements.email.value.trim(),
        username: authForm.elements.username.value.trim(),
        password: authForm.elements.password.value,
      },
    });
    authToken = result.token;
    accountUser = result.user;
    localStorage.setItem("oda.authToken", authToken);
    authForm.reset();
    showAccount();
    showToast(authMode === "register" ? "Hesabın oluşturuldu" : "Giriş yapıldı");
    try {
      await loadServers();
      await joinPendingServerInvite();
    } catch (error) {
      showToast(error.message);
    }
  } catch (error) {
    showAuthError(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

function showAccount() {
  landing.hidden = true;
  dashboard.hidden = false;
  dashboard.classList.remove("is-guest");
  dashboardContent.hidden = false;
  friendsView.hidden = true;
  dmView.hidden = true;
  document.querySelector("#friends-sidebar").hidden = true;
  topbar.hidden = true;
  authOptions.hidden = true;
  document.querySelector("#account-name").textContent = accountUser.username;
  document.querySelector("#account-avatar").textContent = getInitials(accountUser.username);
  document.querySelector("#open-user-settings").setAttribute("aria-label", `Kullanıcı ayarları: ${accountUser.username}`);
  displayName = accountUser.username;
  restoreIgnoredUsers();
  loadFriends().catch((error) => showToast(error.message));
  loadNotifications().catch((error) => showToast(error.message));
  connectPresence();
  renderDirectMessagesSidebar();
}

function updateNotificationBadge() {
  const badge = document.querySelector("#notification-badge");
  badge.hidden = unreadNotificationCount === 0;
  badge.textContent = unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount);
  document.querySelector("#guild-home").setAttribute(
    "aria-label",
    unreadNotificationCount > 0
      ? `Mesajlar ve arkadaşlar, ${unreadNotificationCount} okunmamış bildirim`
      : "Mesajlar ve arkadaşlar",
  );
}

async function loadNotifications() {
  const result = await apiRequest("/api/notifications");
  notifications = result.notifications;
  unreadNotificationCount = result.unreadCount;
  updateNotificationBadge();
}

async function acknowledgeNotifications(ids = notifications.filter((item) => !item.readAt).map((item) => item.id)) {
  if (!ids.length) return;
  const result = await apiRequest("/api/notifications", { method: "PATCH", body: { ids } });
  const readIds = new Set(ids);
  const readAt = new Date().toISOString();
  notifications = notifications.map((item) =>
    readIds.has(item.id) ? { ...item, readAt } : item);
  unreadNotificationCount = result.unreadCount;
  updateNotificationBadge();
}

function showGuestAccount() {
  closePresenceConnection();
  closeDirectMessageConnection();
  activeDirectMessage = undefined;
  accountUser = undefined;
  ignoredUserIds.clear();
  authToken = undefined;
  localStorage.removeItem("oda.authToken");
  dashboard.classList.remove("is-friends");
  friendsView.hidden = true;
  dmView.hidden = true;
  document.querySelector("#friends-sidebar").hidden = true;
  window.clearInterval(friendsRefreshTimer);
  landing.hidden = false;
  dashboard.hidden = true;
  dashboard.classList.add("is-guest");
  dashboardContent.hidden = false;
  topbar.hidden = false;
  authOptions.hidden = false;
  servers.clear();
  renderServers();
}

document.querySelector("#logout-button").addEventListener("click", async () => {
  if (voiceActive) leaveRoom();
  else closeChatConnection();
  try {
    await apiRequest("/api/logout", { method: "POST" });
  } catch (error) {
    console.warn("Oturum kapatılamadı:", error);
  }
  showGuestAccount();
  showToast("Hesaptan çıkış yapıldı");
});

function openUserSettings() {
  if (!accountUser) return;
  setUserSettingsPage("security");
  document.querySelector("#settings-email").textContent = accountUser.email || "Eski hesap · e-posta eklenmemiş";
  userSettingsForm.elements.currentPassword.value = "";
  userSettingsForm.elements.newPassword.value = "";
  document.querySelector("#allow-direct-messages").checked = accountUser.allowDirectMessages === true;
  loadAccountSessions().catch((error) => showToast(error.message));
  userSettingsDialog.showModal();
}

document.querySelector("#open-user-settings").addEventListener("click", openUserSettings);
document.querySelector("#allow-direct-messages").addEventListener("change", async (event) => {
  const checkbox = event.currentTarget;
  checkbox.disabled = true;
  try {
    const result = await apiRequest("/api/me/preferences", {
      method: "PATCH",
      body: { allowDirectMessages: checkbox.checked },
    });
    accountUser = { ...accountUser, ...result.user };
    await loadFriends();
    showToast(checkbox.checked
      ? "Arkadaş olmayanlardan özel mesaj alabilirsin"
      : "Arkadaş olmayanlardan özel mesaj alma kapatıldı");
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    showToast(error.message);
  } finally {
    checkbox.disabled = false;
  }
});
document.querySelector("#close-user-settings").addEventListener("click", () => userSettingsDialog.close());
document.querySelector("#cancel-user-settings").addEventListener("click", () => userSettingsDialog.close());
userSettingsDialog.addEventListener("click", (event) => {
  if (event.target === userSettingsDialog) userSettingsDialog.close();
});
userSettingsForm.addEventListener("submit", (event) => event.preventDefault());
document.querySelectorAll("[data-settings-page]").forEach((button) => {
  button.addEventListener("click", () => setUserSettingsPage(button.dataset.settingsPage));
});

function setUserSettingsPage(page) {
  document.querySelectorAll("[data-settings-page]").forEach((button) =>
    button.classList.toggle("is-active", button.dataset.settingsPage === page));
  document.querySelectorAll("[data-settings-content]").forEach((content) => {
    content.hidden = content.dataset.settingsContent !== page;
  });
  if (page === "audio") loadAudioSettings().catch((error) => showToast(error.message));
}

document.querySelector("#change-password-button").addEventListener("click", async () => {
  const currentPassword = userSettingsForm.elements.currentPassword.value;
  const newPassword = userSettingsForm.elements.newPassword.value;
  try {
    await apiRequest("/api/me/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
    userSettingsForm.elements.currentPassword.value = "";
    userSettingsForm.elements.newPassword.value = "";
    await loadAccountSessions();
    showToast("Şifren güncellendi. Diğer cihazlardaki oturumlar kapatıldı.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#edit-user-profile").addEventListener("click", () => {
  if (!accountUser) return;
  const profile = accountUser;
  userSettingsDialog.close();
  openProfileEditor(profile);
});
userSettingsDialog.addEventListener("close", stopMicrophoneTest);

function formatMemberDate(value) {
  if (!value) return "Tarih bilgisi yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Tarih bilgisi yok" : date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function openProfileEditor(profile) {
  profileEditForm.elements.username.value = profile.username || "";
  profileEditForm.elements.bio.value = profile.bio || "";
  document.querySelector("#profile-edit-avatar").textContent = getInitials(profile.username || "");
  document.querySelector("#profile-edit-joined").textContent = formatMemberDate(profile.createdAt);
  profileEditDialog.showModal();
  profileEditForm.elements.username.focus();
}

document.querySelector("#close-profile-edit").addEventListener("click", () => profileEditDialog.close());
document.querySelector("#cancel-profile-edit").addEventListener("click", () => profileEditDialog.close());
profileEditDialog.addEventListener("click", (event) => {
  if (event.target === profileEditDialog) profileEditDialog.close();
});
profileEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = profileEditForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const result = await apiRequest("/api/me/profile", {
      method: "PATCH",
      body: {
        username: profileEditForm.elements.username.value.trim(),
        bio: profileEditForm.elements.bio.value.trim(),
      },
    });
    accountUser = { ...accountUser, ...result.profile };
    displayName = accountUser.username;
    showAccount();
    if (voiceActive) renderParticipant("self", displayName, localStream);
    profileEditDialog.close();
    showToast("Profil güncellendi");
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

async function loadAccountSessions() {
  const list = document.querySelector("#account-sessions");
  const { sessions: accountSessions } = await apiRequest("/api/me/sessions");
  list.replaceChildren();
  if (!accountSessions.length) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = "Etkin oturum bulunamadı.";
    list.append(empty);
    return;
  }
  for (const session of accountSessions) {
    const row = document.createElement("article");
    row.className = "account-session";
    const details = document.createElement("div");
    const device = document.createElement("strong");
    device.textContent = session.device || "Bilinmeyen cihaz";
    const date = document.createElement("small");
    const loggedInAt = session.createdAt ? new Date(session.createdAt) : undefined;
    date.textContent = loggedInAt && !Number.isNaN(loggedInAt.getTime())
      ? loggedInAt.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
      : "Tarih bilgisi yok";
    details.append(device, date);
    row.append(details);
    if (session.isCurrent) {
      const current = document.createElement("span");
      current.className = "current-session-badge";
      current.textContent = "Bu cihaz";
      row.append(current);
    } else {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "settings-danger-button";
      revoke.textContent = "Oturumu kapat";
      revoke.addEventListener("click", async () => {
        revoke.disabled = true;
        try {
          await apiRequest(`/api/me/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
          await loadAccountSessions();
          showToast("Cihaz oturumu kapatıldı");
        } catch (error) {
          showToast(error.message);
          revoke.disabled = false;
        }
      });
      row.append(revoke);
    }
    list.append(row);
  }
}

function getAudioPreference(key, fallback = "") {
  return localStorage.getItem(`oda.audio.${key}`) || fallback;
}

function getAudioVolumePreference(key, maximum) {
  const saved = Number(getAudioPreference(key, "100"));
  return Number.isFinite(saved) ? Math.max(0, Math.min(maximum, saved)) : 100;
}

function getAudioInputConstraints() {
  const deviceId = getAudioPreference("inputDevice");
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

function saveAudioPreference(key, value) {
  localStorage.setItem(`oda.audio.${key}`, value);
}

async function loadAudioSettings() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const currentInput = getAudioPreference("inputDevice");
  const currentOutput = getAudioPreference("outputDevice");
  audioInputDevice.replaceChildren();
  audioOutputDevice.replaceChildren();
  const inputs = devices.filter((device) => device.kind === "audioinput");
  const outputs = devices.filter((device) => device.kind === "audiooutput");
  for (const [select, entries, fallbackLabel] of [
    [audioInputDevice, inputs, "Mikrofon"],
    [audioOutputDevice, outputs, "Hoparlör"],
  ]) {
    if (!entries.length) {
      const option = new Option("Cihaz bulunamadı", "");
      select.add(option);
      select.disabled = true;
      continue;
    }
    select.disabled = false;
    for (const [index, device] of entries.entries()) {
      select.add(new Option(device.label || `${fallbackLabel} ${index + 1}`, device.deviceId));
    }
  }
  audioInputDevice.value = inputs.some((device) => device.deviceId === currentInput)
    ? currentInput
    : inputs[0]?.deviceId || "";
  audioOutputDevice.value = outputs.some((device) => device.deviceId === currentOutput)
    ? currentOutput
    : outputs[0]?.deviceId || "";
  saveAudioPreference("inputDevice", audioInputDevice.value);
  saveAudioPreference("outputDevice", audioOutputDevice.value);
  audioInputVolume.value = String(getAudioVolumePreference("inputVolume", 200));
  audioOutputVolume.value = String(getAudioVolumePreference("outputVolume", 100));
  updateAudioVolumeLabels();
  applyOutputSettings();
}

function updateAudioVolumeLabels() {
  document.querySelector("#audio-input-volume-value").textContent = `${audioInputVolume.value}%`;
  document.querySelector("#audio-output-volume-value").textContent = `${audioOutputVolume.value}%`;
  if (voiceGainNode) voiceGainNode.gain.value = Number(audioInputVolume.value) / 100;
  for (const audio of grid.querySelectorAll("audio")) {
    audio.volume = Number(audioOutputVolume.value) / 100;
  }
}

function applyOutputSettings() {
  const sinkId = audioOutputDevice.value || getAudioPreference("outputDevice");
  for (const audio of grid.querySelectorAll("audio")) {
    audio.volume = getAudioVolumePreference("outputVolume", 100) / 100;
    if (!sinkId || audio.dataset.sinkId === sinkId || typeof audio.setSinkId !== "function") continue;
    audio.setSinkId(sinkId).then(() => {
      audio.dataset.sinkId = sinkId;
    }).catch((error) => {
      console.warn("Hoparlör seçimi uygulanamadı:", error);
      showToast("Seçilen hoparlör kullanılamadı.");
    });
  }
}

audioInputDevice.addEventListener("change", async () => {
  saveAudioPreference("inputDevice", audioInputDevice.value);
  if (voiceActive) await switchVoiceMicrophone();
});
audioOutputDevice.addEventListener("change", () => {
  saveAudioPreference("outputDevice", audioOutputDevice.value);
  applyOutputSettings();
});
audioInputVolume.addEventListener("input", () => {
  saveAudioPreference("inputVolume", audioInputVolume.value);
  updateAudioVolumeLabels();
});
audioOutputVolume.addEventListener("input", () => {
  saveAudioPreference("outputVolume", audioOutputVolume.value);
  updateAudioVolumeLabels();
});

async function createVoiceMicrophoneStream(stream) {
  if (!window.AudioContext) return stream;
  voiceAudioContext ||= new AudioContext();
  if (voiceAudioContext.state === "suspended") await voiceAudioContext.resume();
  voiceMicrophoneSource = voiceAudioContext.createMediaStreamSource(stream);
  voiceGainNode = voiceAudioContext.createGain();
  voiceGainNode.gain.value = getAudioVolumePreference("inputVolume", 200) / 100;
  const destination = voiceAudioContext.createMediaStreamDestination();
  voiceMicrophoneSource.connect(voiceGainNode);
  voiceGainNode.connect(destination);
  return destination.stream;
}

async function switchVoiceMicrophone() {
  let nextRawStream;
  let nextStream;
  const previousSource = voiceMicrophoneSource;
  const previousGain = voiceGainNode;
  try {
    nextRawStream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioInputConstraints(),
      video: false,
    });
    nextStream = await createVoiceMicrophoneStream(nextRawStream);
    const nextTrack = nextStream.getAudioTracks()[0];
    await Promise.all(Array.from(peers.values(), ({ connection }) => {
      const sender = connection.getSenders().find((item) => item.track?.kind === "audio");
      return sender ? sender.replaceTrack(nextTrack) : Promise.resolve();
    }));
    stopSpeakingMonitor("self");
    previousSource?.disconnect();
    previousGain?.disconnect();
    localStream?.getTracks().forEach((track) => track.stop());
    rawMicrophoneStream?.getTracks().forEach((track) => track.stop());
    localStream = nextStream;
    rawMicrophoneStream = nextRawStream;
    startSpeakingMonitor("self", localStream);
    renderParticipant("self", displayName, localStream);
    showToast("Mikrofon değiştirildi");
  } catch (error) {
    nextStream?.getTracks().forEach((track) => track.stop());
    nextRawStream?.getTracks().forEach((track) => track.stop());
    if (voiceMicrophoneSource !== previousSource) voiceMicrophoneSource?.disconnect();
    if (voiceGainNode !== previousGain) voiceGainNode?.disconnect();
    voiceMicrophoneSource = previousSource;
    voiceGainNode = previousGain;
    showToast(getMediaError(error));
  }
}

function stopMicrophoneTest() {
  if (microphoneTestFrame) cancelAnimationFrame(microphoneTestFrame);
  microphoneTestFrame = undefined;
  microphoneTestStream?.getTracks().forEach((track) => track.stop());
  microphoneTestStream = undefined;
  microphoneTestContext?.close().catch((error) => console.warn("Mikrofon testi kapatılamadı:", error));
  microphoneTestContext = undefined;
  document.querySelector("#audio-input-meter").style.width = "0%";
  document.querySelector(".audio-level-meter").setAttribute("aria-valuenow", "0");
  document.querySelector("#microphone-test-button").textContent = "Mikrofon Testi";
}

async function startMicrophoneTest() {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    showToast("Mikrofon testi için HTTPS veya localhost üzerinden aç.");
    return;
  }
  try {
    microphoneTestStream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioInputConstraints(),
      video: false,
    });
    microphoneTestContext = new AudioContext();
    const source = microphoneTestContext.createMediaStreamSource(microphoneTestStream);
    const analyser = microphoneTestContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const meter = document.querySelector("#audio-input-meter");
    const meterContainer = document.querySelector(".audio-level-meter");
    document.querySelector("#microphone-test-button").textContent = "Testi Durdur";
    const updateMeter = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      const level = Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 400));
      meter.style.width = `${level}%`;
      meterContainer.setAttribute("aria-valuenow", String(level));
      microphoneTestFrame = requestAnimationFrame(updateMeter);
    };
    updateMeter();
  } catch (error) {
    stopMicrophoneTest();
    showToast(getMediaError(error));
  }
}

document.querySelector("#microphone-test-button").addEventListener("click", () => {
  if (microphoneTestStream) stopMicrophoneTest();
  else startMicrophoneTest();
});

document.querySelector("#speaker-test-button").addEventListener("click", async () => {
  if (!window.AudioContext) {
    showToast("Hoparlör testi bu tarayıcıda desteklenmiyor.");
    return;
  }
  const context = new AudioContext();
  try {
    const sinkId = audioOutputDevice.value;
    if (sinkId && typeof context.setSinkId === "function") await context.setSinkId(sinkId);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0.12 * Number(audioOutputVolume.value) / 100;
    oscillator.frequency.value = 440;
    oscillator.connect(gain).connect(context.destination);
    await context.resume();
    oscillator.start();
    oscillator.stop(context.currentTime + 0.6);
    oscillator.addEventListener("ended", () => {
      context.close().catch((error) => console.warn("Hoparlör testi kapatılamadı:", error));
    }, { once: true });
  } catch (error) {
    context.close().catch((closeError) => console.warn("Hoparlör testi kapatılamadı:", closeError));
    showToast("Hoparlör testi başlatılamadı.");
  }
});

navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  if (userSettingsDialog.open && !document.querySelector('[data-settings-content="audio"]').hidden) {
    loadAudioSettings().catch((error) => showToast(error.message));
  }
});

async function loadServers() {
  const result = await apiRequest("/api/servers");
  servers.clear();
  for (const server of result.servers) servers.set(server.id, server);
  renderServers();
}

function openCreateServerDialog() {
  createServerDialog.showModal();
  document.querySelector("#new-server-name").focus();
}

document.querySelector("#open-create-server").addEventListener("click", openCreateServerDialog);
document.querySelector("#guild-create-server").addEventListener("click", openCreateServerDialog);
document.querySelector("#close-create-server").addEventListener("click", () => createServerDialog.close());
document.querySelector("#cancel-create-server").addEventListener("click", () => createServerDialog.close());
createServerDialog.addEventListener("click", (event) => {
  if (event.target === createServerDialog) createServerDialog.close();
});

function openCreateCategoryDialog(server) {
  if (!server.canManageChannels) return;
  createCategoryForm.elements.name.value = "";
  createCategoryDialog.showModal();
  createCategoryForm.elements.name.focus();
}

document.querySelector("#close-create-category").addEventListener("click", () => createCategoryDialog.close());
document.querySelector("#cancel-create-category").addEventListener("click", () => createCategoryDialog.close());
createCategoryDialog.addEventListener("click", (event) => {
  if (event.target === createCategoryDialog) createCategoryDialog.close();
});

function openCreateChannelDialog(server, categoryId = null, type = "voice") {
  if (!server.canManageChannels) return;
  createChannelForm.elements.name.value = "";
  createChannelForm.elements.type.value = type;
  createChannelForm.elements.categoryId.value = categoryId || "";
  createChannelDialog.showModal();
  createChannelForm.elements.name.focus();
}

document.querySelector("#close-create-channel").addEventListener("click", () => createChannelDialog.close());
document.querySelector("#cancel-create-channel").addEventListener("click", () => createChannelDialog.close());
createChannelDialog.addEventListener("click", (event) => {
  if (event.target === createChannelDialog) createChannelDialog.close();
});

createCategoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const server = selectedServer;
  if (!server?.canManageChannels) return;
  const button = createCategoryForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await apiRequest(`/api/servers/${server.id}/categories`, {
      method: "POST",
      body: { name: createCategoryForm.elements.name.value.trim() },
    });
    servers.set(result.server.id, result.server);
    selectedServer = result.server;
    renderServers();
    createCategoryDialog.close();
    showToast("Kategori oluşturuldu");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

createChannelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const server = selectedServer;
  if (!server?.canManageChannels) return;
  const button = createChannelForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await apiRequest(`/api/servers/${server.id}/channels`, {
      method: "POST",
      body: {
        name: createChannelForm.elements.name.value.trim(),
        type: createChannelForm.elements.type.value,
        categoryId: createChannelForm.elements.categoryId.value || null,
      },
    });
    servers.set(result.server.id, result.server);
    selectedServer = result.server;
    renderServers();
    createChannelDialog.close();
    showToast(createChannelForm.elements.type.value === "text" ? "Sohbet odası oluşturuldu" : "Ses odası oluşturuldu");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

async function openRenameDialog(server, channel) {
  pendingRename = { server, channel };
  const isChannel = Boolean(channel);
  document.querySelector("#rename-title").textContent = isChannel ? "Oda adını düzenle" : "Sunucu adını düzenle";
  document.querySelector("#rename-label").textContent = isChannel ? "Oda adı" : "Sunucu adı";
  const input = document.querySelector("#rename-input");
  const nameLabel = document.querySelector("#rename-label");
  const saveRenameButton = document.querySelector("#save-rename");
  const categoryLabel = document.querySelector("#channel-category-label");
  const categorySelect = document.querySelector("#channel-category");
  input.maxLength = isChannel ? 32 : 48;
  input.value = isChannel ? channel.name : server.name;
  const permissionsSection = document.querySelector("#channel-permissions-section");
  const deleteChannelButton = document.querySelector("#delete-channel");
  const canEditChannel = !isChannel || server.canManageChannels || channel.canManage;
  const canEditPermissions = isChannel && (server.canManageChannels || channel.canManagePermissions);
  nameLabel.hidden = !canEditChannel;
  input.hidden = !canEditChannel;
  input.required = canEditChannel;
  categoryLabel.hidden = !isChannel || !canEditChannel;
  categorySelect.hidden = !isChannel || !canEditChannel;
  categorySelect.replaceChildren();
  const rootOption = document.createElement("option");
  rootOption.value = "";
  rootOption.textContent = "Kategori yok";
  categorySelect.append(rootOption);
  for (const category of server.categories || []) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);
  }
  categorySelect.value = isChannel ? channel.categoryId || "" : "";
  saveRenameButton.hidden = !canEditChannel;
  permissionsSection.hidden = !canEditPermissions;
  deleteChannelButton.hidden = !isChannel || !canEditChannel;
  renameDialog.classList.toggle("is-channel-editor", isChannel);
  channelPermissionData = undefined;
  if (canEditPermissions) {
    try {
      channelPermissionData = await apiRequest(`/api/servers/${server.id}/channels/${channel.id}/permissions`);
      const roleSelect = document.querySelector("#channel-permission-role");
      roleSelect.replaceChildren();
      for (const role of channelPermissionData.roles) {
        const option = document.createElement("option");
        option.value = role.id;
        option.textContent = role.isDefault ? "@everyone · Varsayılan izinler" : role.name;
        roleSelect.append(option);
      }
      renderChannelPermissions();
    } catch (error) {
      channelPermissionData = undefined;
      permissionsSection.hidden = true;
      showToast(error.message);
      if (!canEditChannel) {
        pendingRename = undefined;
        return;
      }
    }
  }
  renameDialog.showModal();
  input.focus();
  input.select();
}

function renderChannelPermissions() {
  if (!channelPermissionData) return;
  const roleId = document.querySelector("#channel-permission-role").value;
  const list = document.querySelector("#channel-permission-list");
  list.replaceChildren();
  const roleOverrides = channelPermissionData.overwrites[roleId] || {};
  const groupedPermissions = new Map();
  for (const [permissionId, permission] of Object.entries(channelPermissionData.permissions)) {
    if (!groupedPermissions.has(permission.category)) groupedPermissions.set(permission.category, []);
    groupedPermissions.get(permission.category).push([permissionId, permission]);
  }
  for (const [category, permissions] of groupedPermissions) {
    const heading = document.createElement("h4");
    heading.textContent = category;
    list.append(heading);
    for (const [permissionId, permission] of permissions) {
      const row = document.createElement("div");
      row.className = "channel-permission-row";
      const description = document.createElement("span");
      description.className = "channel-permission-description";
      const name = document.createElement("strong");
      name.textContent = permission.name;
      const detail = document.createElement("small");
      detail.textContent = permission.description;
      description.append(name, detail);
      const controls = document.createElement("div");
      controls.className = "channel-permission-controls";
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", `${permission.name} izni`);
      const state = roleOverrides[permissionId] || "inherit";
      for (const [value, label, title] of [
        ["deny", "×", "Reddet"],
        ["inherit", "/", "Devral"],
        ["allow", "✓", "İzin ver"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.setAttribute("aria-pressed", String(state === value));
        button.classList.toggle("is-selected", state === value);
        button.addEventListener("click", () => {
          if (!channelPermissionData.overwrites[roleId]) channelPermissionData.overwrites[roleId] = {};
          if (value === "inherit") delete channelPermissionData.overwrites[roleId][permissionId];
          else channelPermissionData.overwrites[roleId][permissionId] = value;
          renderChannelPermissions();
        });
        controls.append(button);
      }
      row.append(description, controls);
      list.append(row);
    }
  }
}

document.querySelector("#channel-permission-role").addEventListener("change", renderChannelPermissions);
document.querySelector("#save-channel-permissions").addEventListener("click", async (event) => {
  if (!pendingRename?.channel || !channelPermissionData) return;
  const button = event.currentTarget;
  button.disabled = true;
  const roleId = document.querySelector("#channel-permission-role").value;
  try {
    const response = await apiRequest(
      `/api/servers/${pendingRename.server.id}/channels/${pendingRename.channel.id}/permissions`,
      {
        method: "PATCH",
        body: { roleId, overrides: Object.fromEntries(
          Object.keys(channelPermissionData.permissions).map((permission) => [
            permission,
            channelPermissionData.overwrites[roleId]?.[permission] || "inherit",
          ]),
        ) },
      },
    );
    channelPermissionData.overwrites = response.overwrites;
    renderServers();
    showToast("Kanal izinleri kaydedildi");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#delete-channel").addEventListener("click", async (event) => {
  if (!pendingRename?.channel) return;
  const { server, channel } = pendingRename;
  if (!window.confirm(`“${channel.name}” odası ve sohbet geçmişi silinsin mi?`)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await apiRequest(`/api/servers/${server.id}/channels/${channel.id}`, { method: "DELETE" });
    servers.set(result.server.id, result.server);
    selectedServer = result.server;
    if (currentChannel?.id === channel.id && currentServer?.id === server.id) leaveRoom();
    if (activeChat?.server.id === server.id && activeChat.channelId === channel.id) {
      closeChatConnection();
      activeChat = undefined;
      chatView.hidden = true;
      dashboardContent.hidden = false;
    }
    if (currentServer?.id === result.server.id) currentServer = result.server;
    pendingRename = undefined;
    renameDialog.close();
    renderServers();
    showToast("Oda ve sohbet geçmişi silindi");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#close-rename").addEventListener("click", () => renameDialog.close());
document.querySelector("#cancel-rename").addEventListener("click", () => renameDialog.close());
renameDialog.addEventListener("click", (event) => {
  if (event.target === renameDialog) renameDialog.close();
});

renameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingRename) return;
  if (pendingRename.channel &&
    !(pendingRename.server.canManageChannels || pendingRename.channel.canManage)) return;
  const submitButton = renameForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  const { server, channel } = pendingRename;
  const endpoint = channel
    ? `/api/servers/${server.id}/channels/${channel.id}`
    : `/api/servers/${server.id}`;
  try {
    const result = await apiRequest(endpoint, {
      method: "PATCH",
      body: {
        name: renameForm.elements.name.value.trim(),
        ...(channel ? { categoryId: categorySelect.value || null } : {}),
      },
    });
    servers.set(result.server.id, result.server);
    if (currentServer?.id === result.server.id) currentServer = result.server;
    renderServers();
    renameDialog.close();
    pendingRename = undefined;
    showToast(channel ? "Oda adı güncellendi" : "Sunucu adı güncellendi");
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#create-server-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const result = await apiRequest("/api/servers", {
      method: "POST",
      body: { name: form.elements.name.value.trim() },
    });
    servers.set(result.server.id, result.server);
    selectedServer = result.server;
    renderServers();
    form.reset();
    createServerDialog.close();
    showToast(`“${result.server.name}” sunucusu kuruldu`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

async function handleServerInviteSubmit(form) {
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const result = await apiRequest("/api/servers/join", {
      method: "POST",
      body: { inviteCode: form.elements.inviteCode.value.trim() },
    });
    servers.set(result.server.id, result.server);
    selectedServer = result.server;
    renderServers();
    form.reset();
    showToast(`“${result.server.name}” sunucusuna katıldın`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

for (const form of [
  document.querySelector("#server-invite-form"),
  document.querySelector("#dashboard-server-invite-form"),
]) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleServerInviteSubmit(form);
  });
}

function renderServers() {
  selectedServer = servers.get(selectedServer?.id) ||
    (currentServer && servers.get(currentServer.id)) ||
    servers.values().next().value;
  const canManageSelectedServer = Boolean(selectedServer?.canManage);
  const inviteButton = document.querySelector("#create-server-invite");
  const settingsButton = document.querySelector("#open-server-settings");
  const rolesButton = document.querySelector("#open-server-roles");
  const activeInviteChannel = currentServer?.id === selectedServer?.id ? currentChannel : undefined;
  inviteButton.disabled = !(selectedServer?.canCreateInvite || activeInviteChannel?.canCreateInvite);
  settingsButton.disabled = !canManageSelectedServer;
  rolesButton.disabled = !selectedServer?.canManageRoles;
  inviteButton.title = selectedServer
    ? `${selectedServer.name} için yeni davet kodu oluştur`
    : "Sunucu seç";
  renderServerList(serverList);
  renderServerList(guestServerList);
  renderGuildServers();
}

function showServerNavigation(server) {
  selectedServer = server;
  subscribeToSelectedServerPresence();
  dashboard.classList.remove("is-friends");
  document.querySelector("#friends-sidebar").hidden = true;
  friendsView.hidden = true;
  dmView.hidden = true;
  closeDirectMessageConnection();
  activeDirectMessage = undefined;
  dashboardContent.hidden = false;
  roomView.hidden = true;
  chatView.hidden = true;
  if (activeChat) closeChatConnection();
  activeChat = undefined;
  serverMembers = [];
  serverVoiceParticipants = [];
  serverVoiceParticipantsServerId = server.id;
  renderServerMembers();
  setMembersPanelVisible(true);
  subscribeToSelectedServerPresence();
  document.querySelector(".workspace-location span:last-child").textContent = server.name;
  document.querySelector("#friends-sidebar-home").classList.remove("is-active");
  window.clearInterval(friendsRefreshTimer);
  renderServers();
  if (accountUser) loadServerRoster(server);
}

async function loadServerRoster(server) {
  try {
    const result = await apiRequest(`/api/servers/${server.id}/members`);
    if (selectedServer?.id !== server.id) return;
    serverMembers = result.members;
    serverVoiceParticipants = result.voiceParticipants;
    serverVoiceParticipantsServerId = server.id;
    renderServerMembers();
    renderServers();
  } catch (error) {
    if (selectedServer?.id === server.id) showToast(error.message);
  }
}

function renderGuildServers() {
  const guildList = document.querySelector("#guild-server-list");
  guildList.replaceChildren();
  document.querySelector("#guild-home").classList.toggle("is-active", dashboard.classList.contains("is-friends"));
  for (const server of servers.values()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "guild-button guild-server";
    button.classList.toggle("is-active", server.id === selectedServer?.id && !dashboard.classList.contains("is-friends"));
    button.title = server.name;
    button.setAttribute("aria-label", `${server.name} sunucusunu göster`);
    if (server.image) {
      const image = document.createElement("img");
      image.src = server.image;
      image.alt = "";
      button.append(image);
    } else {
      button.textContent = getInitials(server.name);
    }
    button.addEventListener("click", () => {
      showServerNavigation(server);
    });
    guildList.append(button);
  }
}

document.querySelector("#create-server-invite").addEventListener("click", async () => {
  if (!selectedServer) return;
  const button = document.querySelector("#create-server-invite");
  const channel = currentServer?.id === selectedServer.id ? currentChannel : undefined;
  button.disabled = true;
  try {
    const result = await apiRequest(`/api/servers/${selectedServer.id}/invite`, {
      method: "POST",
      body: channel ? { channelId: channel.id } : undefined,
    });
    servers.set(result.server.id, result.server);
    selectedServer = result.server;
    renderServers();
    await copyServerInvite(result.server, channel);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

function openServerSettings() {
  if (!selectedServer?.canManage) return;
  const server = selectedServer;
  serverSettingsForm.elements.name.value = server.name;
  serverSettingsForm.elements.password.value = "";
  serverSettingsForm.elements.password.disabled = false;
  serverSettingsForm.elements.clearPassword.checked = false;
  serverSettingsForm.elements.clearPassword.disabled = !server.hasPassword;
  serverSettingsForm.elements.image.value = "";
  serverSettingsForm.elements.clearImage.checked = false;
  const preview = document.querySelector("#server-image-preview");
  const placeholder = document.querySelector("#server-image-placeholder");
  preview.hidden = !server.image;
  preview.src = server.image || "";
  placeholder.hidden = Boolean(server.image);
  document.querySelector("#settings-password-state").textContent =
    server.hasPassword ? "(şifre kayıtlı)" : "(şifre yok)";
  document.querySelector("#open-server-roles-from-settings").hidden = !server.canManageRoles;
  document.querySelector("#delete-server").hidden = !server.canDelete;
  serverSettingsDialog.showModal();
  document.querySelector("#settings-server-name").focus();
}

document.querySelector("#open-server-settings").addEventListener("click", openServerSettings);
document.querySelector("#open-server-roles-from-settings").addEventListener("click", () => openServerRoles());
document.querySelector("#open-server-roles").addEventListener("click", () => openServerRoles());
document.querySelector("#delete-server").addEventListener("click", async (event) => {
  const server = selectedServer;
  if (!server?.canDelete) return;
  if (!window.confirm(`“${server.name}” sunucusu ve tüm kanalları/mesajları kalıcı olarak silinsin mi?`)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await apiRequest(`/api/servers/${server.id}`, { method: "DELETE" });
    if (currentServer?.id === server.id) leaveRoom();
    if (activeChat?.server.id === server.id) {
      closeChatConnection();
      activeChat = undefined;
      chatView.hidden = true;
      dashboardContent.hidden = false;
    }
    servers.delete(server.id);
    if (selectedServer?.id === server.id) selectedServer = undefined;
    if (currentServer?.id === server.id) currentServer = undefined;
    serverSettingsDialog.close();
    renderServers();
    showToast("Sunucu ve içeriği silindi");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#close-server-settings").addEventListener("click", () => serverSettingsDialog.close());
document.querySelector("#cancel-server-settings").addEventListener("click", () => serverSettingsDialog.close());
serverSettingsDialog.addEventListener("click", (event) => {
  if (event.target === serverSettingsDialog) serverSettingsDialog.close();
});
document.querySelector("#close-server-roles").addEventListener("click", () => serverRolesDialog.close());
serverRolesDialog.addEventListener("click", (event) => {
  if (event.target === serverRolesDialog) serverRolesDialog.close();
});

async function openServerRoles(server = selectedServer, memberId) {
  if (server) selectedServer = server;
  if (!selectedServer?.canManageRoles) return;
  try {
    const result = await apiRequest(`/api/servers/${selectedServer.id}/roles`);
    serverRoleData = result;
    document.querySelector("#server-roles-title").textContent = `Roller · ${selectedServer.name}`;
    document.querySelector("#server-role-search").value = "";
    document.querySelector("#edit-default-server-role").disabled = !result.canGrantManageServer;
    document.querySelector("#roles-list-panel").hidden = false;
    serverRoleForm.hidden = true;
    serverRolesDialog.showModal();
    renderServerRoles();
    if (memberId) {
      const memberDetails = document.querySelector(`[data-server-role-member="${CSS.escape(memberId)}"]`);
      if (memberDetails) {
        memberDetails.open = true;
        memberDetails.scrollIntoView({ block: "nearest" });
      }
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshServerRoleManager() {
  await loadServers();
  if (!selectedServer?.canManageRoles) {
    serverRolesDialog.close();
    return false;
  }
  serverRoleData = await apiRequest(`/api/servers/${selectedServer.id}/roles`);
  renderServerRoles();
  return true;
}

function renderServerRoles() {
  const search = document.querySelector("#server-role-search").value.trim().toLocaleLowerCase("tr");
  const list = document.querySelector("#server-role-list");
  const defaultRole = serverRoleData.roles.find((role) => role.isDefault);
  if (defaultRole) document.querySelector("#default-server-role-name").textContent = defaultRole.name;
  list.replaceChildren();
  const roles = serverRoleData.roles.filter((role) => !role.isDefault &&
    role.name.toLocaleLowerCase("tr").includes(search));
  if (roles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "server-role-empty";
    empty.textContent = search ? "Aramanla eşleşen rol bulunamadı." : "Henüz özel rol oluşturulmadı.";
    list.append(empty);
  }
  for (const role of roles) {
    const row = document.createElement("div");
    row.className = "server-role-row";
    const name = document.createElement("span");
    name.className = "server-role-name";
    name.style.color = role.color;
    name.textContent = role.name;
    const memberCount = document.createElement("span");
    memberCount.className = "server-role-member-count";
    memberCount.textContent = String(serverRoleData.members.filter((member) => member.roleIds.includes(role.id)).length);
    const actions = document.createElement("div");
    actions.className = "server-role-row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "✎";
    edit.setAttribute("aria-label", `${role.name} rolünü düzenle`);
    edit.addEventListener("click", () => showServerRoleEditor(role));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "server-role-delete-button";
    remove.textContent = "×";
    remove.title = "Rolü sil";
    remove.setAttribute("aria-label", `${role.name} rolünü sil`);
    remove.addEventListener("click", () => deleteServerRole(role, remove));
    actions.append(edit, remove);
    row.append(name, memberCount, actions);
    list.append(row);
  }
  document.querySelector("#create-server-role").disabled =
    serverRoleData.roles.filter((role) => !role.isDefault).length >= 24;
  renderServerRoleMembers();
}

function renderServerRoleMembers() {
  const list = document.querySelector("#server-role-members");
  list.replaceChildren();
  const roles = serverRoleData.roles.filter((role) => !role.isDefault);
  if (serverRoleData.members.length === 0) {
    const empty = document.createElement("p");
    empty.className = "server-role-empty";
    empty.textContent = "Henüz kayıtlı üye yok. Üyeler davet bağlantısıyla katıldıkça burada görünür.";
    list.append(empty);
    return;
  }
  for (const member of serverRoleData.members) {
    const details = document.createElement("details");
    details.className = "server-role-member";
    details.dataset.serverRoleMember = member.id;
    const summary = document.createElement("summary");
    summary.textContent = member.username;
    details.append(summary);
    const fields = document.createElement("div");
    fields.className = "server-role-member-fields";
    if (member.isOwner) {
      const ownerNote = document.createElement("span");
      ownerNote.className = "settings-note";
      ownerNote.textContent = "Sunucu sahibi tüm izinlere sahiptir.";
      fields.append(ownerNote);
    } else {
      for (const role of roles) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = role.id;
        checkbox.checked = member.roleIds.includes(role.id);
        const name = document.createElement("span");
        name.style.color = role.color;
        name.textContent = role.name;
        label.append(checkbox, name);
        fields.append(label);
      }
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Rolleri kaydet";
      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          const roleIds = Array.from(fields.querySelectorAll('input[type="checkbox"]:checked'), (input) => input.value);
          await apiRequest(`/api/servers/${selectedServer.id}/members/${member.id}/roles`, {
            method: "PATCH",
            body: { roleIds },
          });
          await refreshServerRoleManager();
          showToast(`${member.username} üyesinin rolleri güncellendi`);
        } catch (error) {
          showToast(error.message);
        } finally {
          save.disabled = false;
        }
      });
      fields.append(save);
    }
    details.append(fields);
    list.append(details);
  }
}

function showServerRoleEditor(role) {
  editingServerRole = role;
  document.querySelector("#roles-list-panel").hidden = true;
  serverRoleForm.hidden = false;
  serverRoleForm.elements.name.value = role?.name || "";
  serverRoleForm.elements.color.value = role?.color || "#5865f2";
  for (const checkbox of serverRoleForm.querySelectorAll('input[name="permissions"]')) {
    checkbox.checked = role?.permissions.includes(checkbox.value) || false;
    checkbox.disabled = checkbox.value === "manage_server" && !serverRoleData.canGrantManageServer;
  }
  document.querySelector("#delete-server-role").hidden = !role || role.isDefault;
  serverRoleForm.elements.name.focus();
}

document.querySelector("#server-role-search").addEventListener("input", renderServerRoles);
document.querySelector("#create-server-role").addEventListener("click", () => showServerRoleEditor());
document.querySelector("#edit-default-server-role").addEventListener("click", () => {
  const role = serverRoleData.roles.find((item) => item.isDefault);
  if (role && serverRoleData.canGrantManageServer) showServerRoleEditor(role);
});
document.querySelector("#back-to-server-roles").addEventListener("click", () => {
  editingServerRole = undefined;
  serverRoleForm.hidden = true;
  document.querySelector("#roles-list-panel").hidden = false;
});

serverRoleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedServer?.canManageRoles) return;
  const save = serverRoleForm.querySelector('button[type="submit"]');
  save.disabled = true;
  const body = {
    name: serverRoleForm.elements.name.value.trim(),
    color: serverRoleForm.elements.color.value,
    permissions: Array.from(serverRoleForm.querySelectorAll('input[name="permissions"]:checked'), (input) => input.value),
  };
  const endpoint = editingServerRole
    ? `/api/servers/${selectedServer.id}/roles/${editingServerRole.id}`
    : `/api/servers/${selectedServer.id}/roles`;
  try {
    await apiRequest(endpoint, { method: editingServerRole ? "PATCH" : "POST", body });
    editingServerRole = undefined;
    await refreshServerRoleManager();
    serverRoleForm.hidden = true;
    document.querySelector("#roles-list-panel").hidden = false;
    showToast("Rol izinleri kaydedildi");
  } catch (error) {
    showToast(error.message);
  } finally {
    save.disabled = false;
  }
});

async function deleteServerRole(role, button) {
  if (!role || role.isDefault || !selectedServer?.canManageRoles) return;
  if (!window.confirm(`“${role.name}” rolü ve üyelere atanmış rolleri silinsin mi?`)) return;
  const isEditingDeletedRole = editingServerRole?.id === role.id;
  button.disabled = true;
  try {
    await apiRequest(`/api/servers/${selectedServer.id}/roles/${role.id}`, { method: "DELETE" });
    if (isEditingDeletedRole) editingServerRole = undefined;
    await refreshServerRoleManager();
    if (isEditingDeletedRole) {
      serverRoleForm.hidden = true;
      document.querySelector("#roles-list-panel").hidden = false;
    }
    showToast("Rol silindi");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

document.querySelector("#delete-server-role").addEventListener("click", (event) => {
  if (editingServerRole) deleteServerRole(editingServerRole, event.currentTarget);
});
serverSettingsForm.elements.password.addEventListener("input", () => {
  if (serverSettingsForm.elements.password.value) serverSettingsForm.elements.clearPassword.checked = false;
});
serverSettingsForm.elements.clearPassword.addEventListener("change", (event) => {
  serverSettingsForm.elements.password.disabled = event.currentTarget.checked;
});
serverSettingsForm.elements.image.addEventListener("change", () => {
  const file = serverSettingsForm.elements.image.files[0];
  if (!file) return;
  const preview = document.querySelector("#server-image-preview");
  const placeholder = document.querySelector("#server-image-placeholder");
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  placeholder.hidden = true;
  serverSettingsForm.elements.clearImage.checked = false;
});
serverSettingsForm.elements.clearImage.addEventListener("change", (event) => {
  if (!event.currentTarget.checked) return;
  serverSettingsForm.elements.image.value = "";
  document.querySelector("#server-image-preview").hidden = true;
  document.querySelector("#server-image-placeholder").hidden = false;
});

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Sunucu fotoğrafı okunamadı."));
    });
    reader.addEventListener("error", () => reject(new Error("Sunucu fotoğrafı okunamadı.")));
    reader.readAsDataURL(file);
  });
}

async function compressServerImage(file) {
  const maxBytes = 256 * 1024;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Sunucu fotoğrafı PNG, JPEG veya WebP olmalı.");
  }
  if (file.size <= maxBytes) return readImageAsDataUrl(file);

  const imageUrl = URL.createObjectURL(file);
  let image;
  try {
    image = await new Promise((resolve, reject) => {
      const source = new Image();
      source.addEventListener("load", () => resolve(source), { once: true });
      source.addEventListener("error", () => reject(new Error("Sunucu fotoğrafı açılamadı.")), { once: true });
      source.src = imageUrl;
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }

  const canvas = document.createElement("canvas");
  let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Sunucu fotoğrafı işlenemedi.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const quality = Math.max(0.35, 0.85 - (attempt % 5) * 0.12);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Sunucu fotoğrafı işlenemedi.");
    if (blob.size <= maxBytes) return readImageAsDataUrl(blob);
    if (attempt % 5 === 4) scale *= 0.8;
  }
  throw new Error("Bu fotoğraf 256 KB sınırına sığdırılamadı.");
}

serverSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedServer?.canManage) return;
  const server = selectedServer;
  const submitButton = serverSettingsForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  const imageFile = serverSettingsForm.elements.image.files[0];
  try {
    const body = { name: serverSettingsForm.elements.name.value.trim() };
    const password = serverSettingsForm.elements.password.value;
    if (password) body.password = password;
    if (serverSettingsForm.elements.clearPassword.checked) body.clearPassword = true;
    if (serverSettingsForm.elements.clearImage.checked) body.image = null;
    else if (imageFile) body.image = await compressServerImage(imageFile);
    const result = await apiRequest(`/api/servers/${server.id}`, { method: "PATCH", body });
    servers.set(result.server.id, result.server);
    selectedServer = result.server;
    if (currentServer?.id === result.server.id) currentServer = result.server;
    renderServers();
    serverSettingsDialog.close();
    showToast("Sunucu ayarları güncellendi");
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

function renderChannelParticipants(list, server, channel) {
  list.replaceChildren();
  const participants = server.id === serverVoiceParticipantsServerId
    ? serverVoiceParticipants.filter((participant) => participant.channelId === channel.id)
    : [];
  const visibleParticipants = participants.length
    ? participants
    : voiceActive && currentServer?.id === server.id && currentChannel?.id === channel.id
      ? Array.from(participantNames, ([id, username]) => ({ clientId: id, username }))
      : [];
  list.hidden = visibleParticipants.length === 0;
  for (const member of visibleParticipants) {
    const participantId = member.clientId;
    const name = member.username;
    const participant = document.createElement("div");
    participant.className = "channel-participant";
    participant.dataset.participantId = participantId;
    if (member.id && !member.id.startsWith("guest:")) participant.dataset.userId = member.id;
    participant.dataset.serverId = server.id;
    participant.dataset.serverMember = String(serverMembers.some((serverMember) => serverMember.id === member.id));
    participant.classList.toggle("is-ignored", ignoredUserIds.has(member.id || `guest:${participantId}`));
    participant.classList.toggle("is-speaking", speakingParticipants.has(participantId));
    const avatar = document.createElement("span");
    avatar.className = "channel-participant-avatar";
    avatar.textContent = getInitials(name);
    const participantName = document.createElement("span");
    participantName.className = "channel-participant-name";
    participantName.textContent = name;
    if (participantStates.has(participantId)) {
      participant.append(avatar, participantName, createParticipantIndicators(getParticipantState(participantId)));
    } else {
      participant.append(avatar, participantName);
    }
    list.append(participant);
  }
}

function updateServerMemberPresence(message) {
  if (message.serverId !== currentServer?.id && message.serverId !== selectedServer?.id) return;
  serverMembers = Array.isArray(message.members) ? message.members : [];
  serverVoiceParticipants = Array.isArray(message.voiceParticipants) ? message.voiceParticipants : [];
  serverVoiceParticipantsServerId = message.serverId;
  renderServerMembers();
  renderServers();
}

async function saveServerLayout(server, channelList) {
  const categoryIds = Array.from(channelList.querySelectorAll(".channel-category[data-category-id]"))
    .map((category) => category.dataset.categoryId)
    .filter(Boolean);
  const channels = Array.from(channelList.querySelectorAll(".channel-category-content-inner > .channel-entry[data-channel-id]"))
    .map((entry) => ({
      id: entry.dataset.channelId,
      categoryId: entry.closest(".channel-category")?.dataset.categoryId || null,
    }));
  try {
    const result = await apiRequest(`/api/servers/${server.id}/layout`, {
      method: "PATCH",
      body: { categoryIds, channels },
    });
    servers.set(server.id, result.server);
    if (selectedServer?.id === server.id) selectedServer = result.server;
    if (currentServer?.id === server.id) currentServer = result.server;
    renderServers();
    showToast("Oda düzeni güncellendi");
  } catch (error) {
    showToast(error.message);
    renderServers();
  }
}

function enableServerLayoutDragging(channelList, server) {
  if (!server.canMoveChannels) return;
  channelList.addEventListener("dragstart", (event) => {
    const channelEntry = event.target.closest(".channel-entry[draggable='true']");
    const categoryHeading = event.target.closest(".channel-category-heading[draggable='true']");
    const category = categoryHeading?.closest(".channel-category");
    if (!channelEntry && (!category || !category.dataset.categoryId)) return;
    draggedLayoutItem = channelEntry
      ? { kind: "channel", id: channelEntry.dataset.channelId, serverId: server.id }
      : { kind: "category", id: category.dataset.categoryId, serverId: server.id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(draggedLayoutItem));
    (channelEntry || category).classList.add("is-dragging");
  });
  channelList.addEventListener("dragover", (event) => {
    if (!draggedLayoutItem || draggedLayoutItem.serverId !== server.id) return;
    const target = event.target.closest(".channel-entry, .channel-category");
    if (!target || target.classList.contains("is-dragging")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    channelList.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    target.classList.add("is-drop-target");
  });
  channelList.addEventListener("drop", (event) => {
    if (!draggedLayoutItem || draggedLayoutItem.serverId !== server.id) return;
    const targetEntry = event.target.closest(".channel-entry");
    const targetCategory = targetEntry?.closest(".channel-category") ||
      event.target.closest(".channel-category");
    if (!targetCategory) return;
    const source = draggedLayoutItem.kind === "channel"
      ? channelList.querySelector(`.channel-entry[data-channel-id="${CSS.escape(draggedLayoutItem.id)}"]`)
      : channelList.querySelector(`.channel-category[data-category-id="${CSS.escape(draggedLayoutItem.id)}"]`);
    if (!source || source === targetEntry || source === targetCategory) return;
    event.preventDefault();
    if (draggedLayoutItem.kind === "category") {
      const target = targetCategory.dataset.categoryId ? targetCategory : channelList.querySelector(".channel-category[data-category-id]");
      if (!target || source === target) return;
      const after = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
      channelList.insertBefore(source, after ? target.nextSibling : target);
    } else {
      const content = targetCategory.querySelector(".channel-category-content-inner");
      if (!content) return;
      if (targetEntry) {
        const after = event.clientY > targetEntry.getBoundingClientRect().top + targetEntry.getBoundingClientRect().height / 2;
        content.insertBefore(source, after ? targetEntry.nextSibling : targetEntry);
      } else {
        content.append(source);
      }
    }
    draggedLayoutItem = undefined;
    channelList.querySelectorAll(".is-dragging, .is-drop-target")
      .forEach((item) => item.classList.remove("is-dragging", "is-drop-target"));
    saveServerLayout(server, channelList);
  });
  channelList.addEventListener("dragend", () => {
    draggedLayoutItem = undefined;
    channelList.querySelectorAll(".is-dragging, .is-drop-target")
      .forEach((item) => item.classList.remove("is-dragging", "is-drop-target"));
  });
}

function renderServerList(target) {
  target.replaceChildren();
  if (servers.size === 0 || (target === serverList && !selectedServer)) {
    if (target === serverList) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-server-state";
      emptyState.textContent = "Henüz bir sunucuya katılmadın. Yeni sunucu kurabilir veya davet koduyla katılabilirsin.";
      target.append(emptyState);
    }
    return;
  }
  const visibleServers = target === serverList ? [selectedServer] : servers.values();
  for (const server of visibleServers) {
    const entry = document.createElement("section");
    entry.className = "server-entry";
    entry.dataset.serverId = server.id;
    const heading = document.createElement("div");
    heading.className = "server-entry-head";
    const name = document.createElement("span");
    name.textContent = server.name;
    const share = document.createElement("button");
    share.type = "button";
    share.textContent = "Davet et";
    share.addEventListener("click", () => copyServerInvite(server));
    heading.append(name, share);
    if (server.canManageChannels && target === serverList) {
      const addCategoryButton = document.createElement("button");
      addCategoryButton.type = "button";
      addCategoryButton.textContent = "+ Kategori";
      addCategoryButton.addEventListener("click", () => openCreateCategoryDialog(server));
      heading.insertBefore(addCategoryButton, share);
    }
    if (server.canManage && target === serverList) {
      const editServerButton = document.createElement("button");
      editServerButton.type = "button";
      editServerButton.textContent = "Düzenle";
      editServerButton.setAttribute("aria-label", `${server.name} sunucu adını düzenle`);
      editServerButton.addEventListener("click", () => openRenameDialog(server));
      heading.insertBefore(editServerButton, share);
    }

    const channelList = document.createElement("div");
    channelList.className = "channel-list";
    enableServerLayoutDragging(channelList, { ...server, canMoveChannels: server.canMoveChannels && target === serverList });
    const renderChannel = (channel, categorySection) => {
      const channelEntry = document.createElement("div");
      channelEntry.className = "channel-entry";
      channelEntry.dataset.channelId = channel.id;
      if (server.canMoveChannels && target === serverList) channelEntry.draggable = true;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `channel-button ${channel.type === "text" ? "chat-channel-button" : "voice-channel-button"}`;
      const isActive = channel.type === "text"
        ? activeChat?.server.id === server.id && activeChat.channelId === channel.id
        : currentServer?.id === server.id && currentChannel?.id === channel.id;
      button.classList.toggle("is-active", isActive);
      button.textContent = `${channel.type === "text" ? "#" : "◖"}  ${channel.name}`;
      if (channel.type === "text") {
        button.addEventListener("click", () => openServerChat(server, channel.id, channel.name));
      } else {
        button.addEventListener("click", () => joinServerChannel(server, channel));
        const participantList = document.createElement("div");
        participantList.className = "channel-participants";
        participantList.dataset.serverId = server.id;
        participantList.dataset.channelId = channel.id;
        participantList.setAttribute("aria-label", `${channel.name} ses kanalındaki kullanıcılar`);
        channelEntry.append(button, participantList);
        renderChannelParticipants(participantList, server, channel);
      }
      if ((server.canManageChannels || channel.canManage || channel.canManagePermissions) && target === serverList) {
        const editChannelButton = document.createElement("button");
        editChannelButton.type = "button";
        editChannelButton.className = "edit-channel-button";
        editChannelButton.textContent = "⚙";
        editChannelButton.setAttribute("aria-label", `${channel.name} kanalını düzenle`);
        editChannelButton.addEventListener("click", () => openRenameDialog(server, channel));
        channelEntry.append(editChannelButton);
      }
      if (channel.type === "text") channelEntry.prepend(button);
      categorySection.append(channelEntry);
      if (channel.legacyChat) {
        const legacyChatButton = document.createElement("button");
        legacyChatButton.type = "button";
        legacyChatButton.className = "channel-button chat-channel-button legacy-chat-channel";
        legacyChatButton.textContent = `#  ${channel.name} sohbeti`;
        legacyChatButton.addEventListener("click", () =>
          openServerChat(server, channel.id, `${channel.name} sohbeti`));
        categorySection.append(legacyChatButton);
      }
    };

    const renderCategory = (category, channels) => {
      const section = document.createElement("section");
      section.className = "channel-category";
      const categoryKey = category.id || `uncategorized:${server.id}`;
      section.dataset.categoryId = category.id || "";
      const isCollapsed = collapsedCategories.get(categoryKey) || false;
      section.classList.toggle("is-collapsed", isCollapsed);
      const categoryHeading = document.createElement("div");
      categoryHeading.className = "channel-category-heading";
      if (server.canMoveChannels && target === serverList && category.id) categoryHeading.draggable = true;
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "channel-category-toggle";
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
      toggleButton.setAttribute("aria-label", `${category.name} kategorisini ${isCollapsed ? "aç" : "kapat"}`);
      const categoryName = document.createElement("span");
      categoryName.textContent = category.name;
      const chevron = document.createElement("span");
      chevron.className = "channel-category-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "⌄";
      toggleButton.append(chevron, categoryName);
      toggleButton.addEventListener("click", () => {
        const collapsed = section.classList.toggle("is-collapsed");
        collapsedCategories.set(categoryKey, collapsed);
        toggleButton.setAttribute("aria-expanded", String(!collapsed));
        toggleButton.setAttribute("aria-label", `${category.name} kategorisini ${collapsed ? "aç" : "kapat"}`);
      });
      categoryHeading.append(toggleButton);
      if (server.canManageChannels && target === serverList) {
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "+";
        addButton.title = `“${category.name}” kategorisine kanal ekle`;
        addButton.setAttribute("aria-label", addButton.title);
        addButton.addEventListener("click", (event) => event.stopPropagation());
        addButton.addEventListener("click", () => openCreateChannelDialog(server, category.id));
        categoryHeading.append(addButton);
      }
      const content = document.createElement("div");
      content.className = "channel-category-content";
      const contentInner = document.createElement("div");
      contentInner.className = "channel-category-content-inner";
      for (const channel of channels) renderChannel(channel, contentInner);
      content.append(contentInner);
      section.append(categoryHeading, content);
      channelList.append(section);
    };

    for (const category of server.categories || []) {
      renderCategory(category, server.channels.filter((channel) => channel.categoryId === category.id));
    }
    const uncategorizedChannels = server.channels.filter((channel) => !channel.categoryId);
    if (uncategorizedChannels.length) {
      renderCategory({ id: null, name: server.categories?.length ? "Kategorisiz" : "Kanallar" }, uncategorizedChannels);
    }
    if (!server.channels.some((channel) => channel.type === "text")) {
      const legacyChatEntry = document.createElement("div");
      legacyChatEntry.className = "channel-entry legacy-general-chat";
      const generalChatButton = document.createElement("button");
      generalChatButton.type = "button";
      generalChatButton.className = "channel-button chat-channel-button";
      generalChatButton.classList.toggle("is-active", activeChat?.server.id === server.id && activeChat.channelId === "general");
      generalChatButton.textContent = "#  Genel sohbet";
      generalChatButton.addEventListener("click", () => openServerChat(server, "general", "Genel sohbet"));
      legacyChatEntry.append(generalChatButton);
      channelList.prepend(legacyChatEntry);
    }
    entry.append(heading, channelList);
    if (server.canManageChannels && target === serverList) {
      const addChannelButton = document.createElement("button");
      addChannelButton.type = "button";
      addChannelButton.className = "add-channel-button";
      addChannelButton.textContent = "+ Kanal oluştur";
      addChannelButton.addEventListener("click", () => openCreateChannelDialog(server));
      entry.append(addChannelButton);
    }
    target.append(entry);
  }
}

function openServerChat(server, channelId, title) {
  const name = displayName || accountUser?.username || joinForm.elements.name.value.trim();
  if (!name) {
    showToast("Sohbete yazmak için önce adını gir.");
    document.querySelector("#display-name").focus();
    return;
  }
  closeChatConnection();

  selectedServer = server;
  activeChat = { server, channelId, title };
  serverMembers = [];
  serverVoiceParticipants = [];
  serverVoiceParticipantsServerId = undefined;
  renderServerMembers();
  setMembersPanelVisible(true);
  chatReady = false;
  setChatReady(false);
  chatMessages.replaceChildren();
  chatInput.value = "";
  document.querySelector("#chat-title").textContent = title;
  document.querySelector("#chat-subtitle").textContent = "Bağlanıyor…";
  dashboard.hidden = false;
  dashboardContent.hidden = true;
  roomView.hidden = true;
  chatView.hidden = false;
  document.querySelector("#return-to-voice").hidden = !voiceActive;
  topbar.hidden = true;
  document.querySelector(".workspace-location span:last-child").textContent = `${server.name} · ${title}`;
  renderServers();

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const parameters = new URLSearchParams({
    server: server.id,
    channel: channelId,
    invite: server.inviteCode,
    name,
  });
  const connection = new WebSocket(`${protocol}//${location.host}/chat?${parameters}`);
  chatSocket = connection;
  connection.addEventListener("open", () => {
    if (chatSocket === connection) {
      if (authToken) connection.send(JSON.stringify({ type: "presence-auth", token: authToken }));
      document.querySelector("#chat-subtitle").textContent = "Sohbet geçmişi yükleniyor…";
    }
  });
  connection.addEventListener("message", ({ data }) => {
    if (chatSocket !== connection) return;
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error("Sohbet mesajı okunamadı:", error);
      showToast("Sohbet sunucusundan geçersiz yanıt alındı.");
      return;
    }
    if (message.type === "chat-history") {
      updateServerMemberPresence({ ...message, serverId: server.id });
      chatReady = true;
      setChatReady(true);
      document.querySelector("#retry-chat").hidden = true;
      document.querySelector("#chat-subtitle").textContent = "Mesajların sunucuda saklanır.";
      chatMessages.replaceChildren();
      if (message.messages.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "chat-empty-state";
        const marker = document.createElement("span");
        marker.textContent = "#";
        const heading = document.createElement("h2");
        heading.textContent = `${title} sohbetine hoş geldin!`;
        const description = document.createElement("p");
        description.textContent = "Bu sohbetin başlangıcı. İlk mesajı sen gönder.";
        emptyState.append(marker, heading, description);
        chatMessages.append(emptyState);
      } else {
        for (const chatMessage of message.messages) appendChatMessage(chatMessage);
      }
    } else if (message.type === "chat-message") {
      appendChatMessage(message.message);
    } else if (message.type === "chat-error") {
      showToast(message.message);
    } else if (message.type === "server-members") {
      updateServerMemberPresence(message);
    }
  });
  connection.addEventListener("close", (event) => {
    if (chatSocket !== connection) return;
    chatSocket = undefined;
    chatReady = false;
    setChatReady(false);
    if (chatView.hidden) return;
    document.querySelector("#chat-subtitle").textContent = event.code === 1008
      ? `${event.reason}. Sunucuyu yeniden başlatıp tekrar dene.`
      : "Sohbet bağlantısı kurulamadı. Sunucuyu yeniden başlatıp tekrar dene.";
    document.querySelector("#retry-chat").hidden = false;
  });
  connection.addEventListener("error", () => {
    if (chatSocket === connection) {
      document.querySelector("#chat-subtitle").textContent =
        "Sohbet bağlantısı kurulamadı. Sunucuyu yeniden başlatıp tekrar dene.";
      document.querySelector("#retry-chat").hidden = false;
      setChatReady(false);
    }
  });
}

function setChatReady(ready) {
  chatInput.disabled = !ready;
  document.querySelector("#send-chat-message").disabled = !ready;
}

function setMembersPanelVisible(visible) {
  const isServerView = Boolean((selectedServer || currentServer) &&
    !dashboard.classList.contains("is-friends") && dmView.hidden);
  const shouldShow = visible && isServerView;
  serverMembersPanel.hidden = !shouldShow;
  workspaceLayout.classList.toggle("has-members", shouldShow);
  workspaceLayout.classList.toggle("members-open", shouldShow);
  const topbarToggle = document.querySelector("#toggle-members-topbar");
  topbarToggle.hidden = !isServerView;
  topbarToggle.setAttribute("aria-expanded", String(shouldShow));
  topbarToggle.setAttribute("aria-label", shouldShow ? "Üye listesini kapat" : "Üye listesini aç");
  topbarToggle.title = shouldShow ? "Üye listesini kapat" : "Üye listesini aç";
  document.querySelector("#toggle-members").setAttribute("aria-expanded", String(shouldShow));
}

function renderServerMembers() {
  const memberById = new Map(serverMembers.map((member) => [member.id, member]));
  const onlineById = new Map();
  for (const user of globallyOnlineUsers) {
    const serverMember = memberById.get(user.id);
    if (!serverMember) continue;
    onlineById.set(user.id, { ...serverMember, ...user, isOnline: true, isServerMember: true });
  }
  for (const member of serverMembers) {
    if (member.isOnline) {
      onlineById.set(member.id, { ...member, isServerMember: true });
    }
  }
  const onlineMembers = Array.from(onlineById.values())
    .sort((left, right) => (left.nickname || left.username).localeCompare(right.nickname || right.username, "tr"));
  const offlineMembers = serverMembers.filter((member) => !member.isOnline);
  document.querySelector("#server-member-count").textContent = String(onlineMembers.length + offlineMembers.length);
  document.querySelector("#online-member-count").textContent = String(onlineMembers.length);
  document.querySelector("#offline-member-count").textContent = String(offlineMembers.length);

  for (const [members, list] of [[onlineMembers, onlineMembersList], [offlineMembers, offlineMembersList]]) {
    list.replaceChildren();
    if (members.length === 0) {
      const empty = document.createElement("p");
      empty.className = "server-members-empty";
      empty.textContent = members === onlineMembers ? "Çevrimiçi üye yok" : "Çevrimdışı üye yok";
      list.append(empty);
      continue;
    }
    for (const member of members) {
      const item = document.createElement("div");
      item.className = "server-member";
      item.dataset.userId = member.id;
      item.dataset.serverId = selectedServer?.id || currentServer?.id || "";
      item.dataset.serverMember = String(member.isServerMember !== false);
      item.classList.toggle("is-ignored", ignoredUserIds.has(member.id));
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `${member.nickname || member.username} profilini görüntüle`);
      const avatar = document.createElement("span");
      avatar.className = "server-member-avatar member-profile-avatar";
      avatar.textContent = getInitials(member.nickname || member.username);
      const name = document.createElement("span");
      name.className = "server-member-name";
      name.textContent = member.nickname || member.username;
      item.append(avatar, name);
      list.append(item);
    }
  }
}

function closeMemberContextMenu() {
  memberContextMenu?.remove();
  memberContextMenu = undefined;
}

async function showMemberProfile(target) {
  let profile = { username: target.username, bio: "", createdAt: null };
  let canMessage = false;
  const isSelf = target.userId === accountUser?.id;
  if (target.userId) {
    try {
      profile = (await apiRequest(`/api/users/${encodeURIComponent(target.userId)}/profile`)).profile;
      if (accountUser && !isSelf) {
        const { users } = await apiRequest(`/api/users/search?q=${encodeURIComponent(profile.username)}`);
        const user = users.find((item) => item.id === target.userId);
        canMessage = friendData.friends.some((friend) => friend.id === target.userId) ||
          user?.canMessage === true;
      }
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
  if (!profileDialog) {
    profileDialog = document.createElement("dialog");
    profileDialog.className = "create-server-dialog member-profile-dialog";
    profileDialog.setAttribute("aria-labelledby", "member-profile-title");
    profileDialog.addEventListener("click", (event) => {
      if (event.target === profileDialog) profileDialog.close();
    });
    document.body.append(profileDialog);
  }
  profileDialog.replaceChildren();
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dialog-close";
  closeButton.setAttribute("aria-label", "Kapat");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => profileDialog.close());
  const banner = document.createElement("div");
  banner.className = "member-profile-banner";
  const identity = document.createElement("div");
  identity.className = "member-profile-identity";
  const avatar = document.createElement("span");
  avatar.className = "server-member-avatar";
  avatar.textContent = getInitials(profile.username);
  const title = document.createElement("h2");
  title.id = "member-profile-title";
  title.textContent = profile.username;
  const status = document.createElement("p");
  status.className = "member-profile-status";
  const member = serverMembers.find((item) => item.id === target.userId);
  status.textContent = member?.isOnline ? "Çevrim içi" : target.userId ? "Çevrim dışı" : "Misafir";
  status.classList.toggle("is-online", member?.isOnline === true);
  identity.append(title, status);
  const header = document.createElement("div");
  header.className = "member-profile-header";
  header.append(banner, avatar, identity);
  const bioTitle = document.createElement("h3");
  bioTitle.className = "profile-section-title";
  bioTitle.textContent = "Biyografi";
  const bio = document.createElement("p");
  bio.className = "profile-bio";
  bio.textContent = profile.bio || "Henüz biyografi eklenmemiş.";
  const joinedTitle = document.createElement("h3");
  joinedTitle.className = "profile-section-title";
  joinedTitle.textContent = "Şu tarihten beri üye";
  const joined = document.createElement("p");
  joined.className = "profile-joined-date";
  joined.textContent = formatMemberDate(profile.createdAt);
  profileDialog.append(closeButton, header, bioTitle, bio, joinedTitle, joined);
  if (target.server?.name && target.isServerMember) {
    const sharedServerTitle = document.createElement("h3");
    sharedServerTitle.className = "profile-section-title";
    sharedServerTitle.textContent = "Ortak sunucu";
    const sharedServer = document.createElement("div");
    sharedServer.className = "member-profile-server";
    sharedServer.textContent = target.server.name;
    profileDialog.append(sharedServerTitle, sharedServer);
  }
  if (accountUser && target.userId && !isSelf) {
    const messageForm = document.createElement("form");
    messageForm.className = "member-profile-message-form";
    const messageInput = document.createElement("input");
    messageInput.type = "text";
    messageInput.maxLength = 2000;
    messageInput.placeholder = `@${profile.username} kullanıcısına mesaj...`;
    messageInput.setAttribute("aria-label", `${profile.username} kullanıcısına mesaj gönder`);
    messageInput.disabled = !canMessage;
    const messageButton = document.createElement("button");
    messageButton.type = "submit";
    messageButton.textContent = "Gönder";
    messageButton.disabled = !canMessage;
    messageForm.append(messageInput, messageButton);
    if (!canMessage) {
      const messageHint = document.createElement("p");
      messageHint.className = "member-profile-message-hint";
      messageHint.textContent = friendData.blockedUserIds.includes(target.userId)
        ? "Engellediğin bu kullanıcıya mesaj gönderemezsin."
        : "Bu kullanıcı arkadaş olmayanlardan mesaj kabul etmiyor.";
      profileDialog.append(messageForm, messageHint);
    } else {
      profileDialog.append(messageForm);
    }
    messageForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = messageInput.value.trim();
      if (!text) {
        messageInput.focus();
        return;
      }
      profileDialog.close();
      openDirectMessage({
        ...target,
        id: target.userId,
        username: profile.username,
        isOnline: member?.isOnline === true,
        canMessage,
      }, text);
    });
  }
  if (isSelf) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "settings-secondary-button";
    edit.textContent = "Profili düzenle";
    edit.addEventListener("click", () => {
      profileDialog.close();
      openProfileEditor({ ...profile, email: accountUser.email });
    });
    profileDialog.append(edit);
  }
  profileDialog.showModal();
}

function getMemberContextTarget(element) {
  const serverId = element.dataset.serverId || currentServer?.id || selectedServer?.id;
  const server = servers.get(serverId) || (currentServer?.id === serverId ? currentServer : selectedServer);
  const participantId = element.dataset.participantId || element.dataset.participant;
  const voiceParticipant = serverVoiceParticipants.find((participant) =>
    participant.clientId === participantId && server?.id === serverVoiceParticipantsServerId);
  const userId = element.dataset.userId || (voiceParticipant?.id && !voiceParticipant.id.startsWith("guest:")
    ? voiceParticipant.id
    : undefined);
  const member = serverMembers.find((item) => item.id === userId);
  const username = member?.username ||
    (voiceParticipant?.username) ||
    element.querySelector(".server-member-name, .channel-participant-name, .participant-name")?.textContent ||
    element.textContent.trim();
  return {
    userId,
    clientId: participantId,
    username,
    server,
    isOnline: member?.isOnline ?? Boolean(voiceParticipant),
    isServerMember: element.dataset.serverMember === "true" || Boolean(member),
  };
}

function showMemberContextMenu(target, x, y) {
  closeMemberContextMenu();
  const menu = document.createElement("div");
  menu.className = "member-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `${target.username} kullanıcı seçenekleri`);
  memberContextMenu = menu;
  const addItem = (label, action, className = "") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.addEventListener("click", () => {
      closeMemberContextMenu();
      action();
    });
    menu.append(button);
  };
  const addSeparator = () => {
    const separator = document.createElement("div");
    separator.className = "member-context-separator";
    separator.setAttribute("role", "separator");
    menu.append(separator);
  };
  const targetIsSelf = target.userId && target.userId === accountUser?.id;
  const friend = friendData.friends.find((item) => item.id === target.userId);
  const hasFriendRequest = friendData.incomingRequests.some((request) => request.user.id === target.userId) ||
    friendData.outgoingRequests.some((request) => request.user.id === target.userId);
  const isBlocked = friendData.blockedUserIds.includes(target.userId);
  const isIgnored = ignoredUserIds.has(target.userId || `guest:${target.clientId}`);
  const server = target.server;

  addItem("Profili Görüntüle", () => showMemberProfile(target));
  if (activeChat) {
    addItem("Bahset", () => {
      chatInput.value = `${chatInput.value}${chatInput.value ? " " : ""}@${target.username} `;
      chatInput.focus();
    });
  }
  if (friend && !isBlocked) addItem("Mesaj Gönder", () => openDirectMessage(friend));
  if (friend?.isOnline && !isBlocked) {
    addItem("Bir Arama Başlat", () => startDirectCall(friend));
  }
  if (accountUser && target.userId && !targetIsSelf && !friend && !hasFriendRequest && !isBlocked) {
    addItem("Arkadaş Ekle", async () => {
      try {
        await apiRequest("/api/friends/requests", { method: "POST", body: { username: target.username } });
        showToast(`${target.username} kullanıcısına arkadaşlık isteği gönderildi`);
        await loadFriends();
      } catch (error) {
        showToast(error.message);
      }
    });
  }
  if (accountUser) {
    addItem("Not Ekle / Düzenle", () => {
      const key = `oda.memberNote.${accountUser.id}.${target.userId || target.username}`;
      const note = window.prompt(`“${target.username}” için yalnızca sana görünen not:`, localStorage.getItem(key) || "");
      if (note === null) return;
      if (note.trim()) localStorage.setItem(key, note.trim());
      else localStorage.removeItem(key);
      showToast(note.trim() ? "Not kaydedildi" : "Not kaldırıldı");
    });
  }

  if (server && target.isServerMember && target.userId && !targetIsSelf && server.canManageNicknames) {
    addSeparator();
    const currentNickname = serverMembers.find((member) => member.id === target.userId)?.nickname || "";
    addItem("Takma Adı Değiştir", async () => {
      const nickname = window.prompt(`${target.username} için takma ad (boş bırakırsan kaldırılır):`, currentNickname);
      if (nickname === null) return;
      try {
        await apiRequest(`/api/servers/${server.id}/members/${target.userId}/nickname`, {
          method: "PATCH",
          body: { nickname },
        });
        await loadServers();
        showToast("Takma ad güncellendi");
      } catch (error) {
        showToast(error.message);
      }
    });
  }
  const inviteChannel = currentServer?.id === server?.id ? currentChannel : undefined;
  if (server && (server.canCreateInvite || inviteChannel?.canCreateInvite)) {
    addItem("Sunucuya Davet Et", async () => {
      try {
        const result = await apiRequest(`/api/servers/${server.id}/invite`, {
          method: "POST",
          body: inviteChannel?.canCreateInvite ? { channelId: inviteChannel.id } : undefined,
        });
        servers.set(result.server.id, result.server);
        selectedServer = result.server;
        await copyServerInvite(result.server, inviteChannel);
      } catch (error) {
        showToast(error.message);
      }
    });
  }
  if (friend && !targetIsSelf) {
    addItem("Arkadaşlardan Çıkar", async () => {
      if (!window.confirm(`${target.username} arkadaşlarından çıkarılsın mı?`)) return;
      await removeFriend(friend);
    }, "is-danger");
  }
  if (accountUser && target.userId && !targetIsSelf) {
    addItem(isIgnored ? "Yok Saymayı Bırak" : "Yok Say", () => {
      const key = target.userId || `guest:${target.clientId}`;
      if (ignoredUserIds.has(key)) ignoredUserIds.delete(key);
      else ignoredUserIds.add(key);
      localStorage.setItem(`oda.ignoredUsers.${accountUser.id}`, JSON.stringify(Array.from(ignoredUserIds)));
      renderServerMembers();
      renderServers();
      for (const card of document.querySelectorAll(".participant-card")) {
        const voiceParticipant = serverVoiceParticipants.find((participant) =>
          participant.clientId === card.dataset.participant);
        card.classList.toggle("is-ignored", ignoredUserIds.has(voiceParticipant?.id || card.dataset.participant));
      }
    });
    addItem(isBlocked ? "Engeli Kaldır" : "Engelle", async () => {
      if (isBlocked && !window.confirm(`${target.username} kullanıcısının engeli kaldırılsın mı?`)) return;
      if (!isBlocked && !window.confirm(`${target.username} engellensin mi? Arkadaşlık bağlantısı kaldırılır.`)) return;
      try {
        await apiRequest(`/api/users/${target.userId}/block`, { method: isBlocked ? "DELETE" : "POST" });
        await loadFriends();
        showToast(isBlocked ? "Kullanıcının engeli kaldırıldı" : "Kullanıcı engellendi");
      } catch (error) {
        showToast(error.message);
      }
    }, "is-danger");
  }
  if (server && target.isServerMember && target.userId && !targetIsSelf && server.canManageRoles) {
    addSeparator();
    addItem("Roller", () => openServerRoles(server, target.userId));
  }
  if (server && target.isServerMember && target.userId && !targetIsSelf &&
    (server.canManageRoles || server.canManageNicknames || server.canKickMembers || server.canBanMembers)) {
    addItem("Mod Görünümünde Aç", () => openModeratorView(server, target.userId));
  }
  if (server && target.isServerMember && target.userId && !targetIsSelf && server.canKickMembers) {
    addSeparator();
    addItem("Sunucudan At", async () => {
      if (!window.confirm(`${target.username} bu sunucudan çıkarılsın mı?`)) return;
      await moderateServerMember(server, target, "kick");
    }, "is-danger");
  }
  if (server && target.isServerMember && target.userId && !targetIsSelf && server.canBanMembers) {
    addItem("Sunucudan Yasakla", async () => {
      if (!window.confirm(`${target.username} sunucudan çıkarılıp yeniden katılması engellensin mi?`)) return;
      await moderateServerMember(server, target, "ban");
    }, "is-danger");
  }
  if (server?.canBanMembers) {
    addItem("Yasaklı Üyeleri Yönet", () => openBannedMembers(server));
  }
  document.body.append(menu);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
  menu.querySelector("button")?.focus();
}

async function moderateServerMember(server, target, action) {
  try {
    const endpoint = action === "ban"
      ? `/api/servers/${server.id}/bans/${target.userId}`
      : `/api/servers/${server.id}/members/${target.userId}`;
    await apiRequest(endpoint, { method: action === "ban" ? "POST" : "DELETE" });
    serverMembers = serverMembers.filter((member) => member.id !== target.userId);
    serverVoiceParticipants = serverVoiceParticipants.filter((participant) => participant.id !== target.userId);
    renderServerMembers();
    renderServers();
    showToast(action === "ban" ? `${target.username} sunucudan yasaklandı` : `${target.username} sunucudan çıkarıldı`);
  } catch (error) {
    showToast(error.message);
  }
}

async function openBannedMembers(server) {
  try {
    const result = await apiRequest(`/api/servers/${server.id}/bans`);
    bannedMembersDialog?.remove();
    const dialog = document.createElement("dialog");
    dialog.className = "create-server-dialog member-bans-dialog";
    dialog.setAttribute("aria-labelledby", "banned-members-title");
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "dialog-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Kapat");
    closeButton.addEventListener("click", () => dialog.close());
    const title = document.createElement("h2");
    title.id = "banned-members-title";
    title.textContent = `Yasaklı üyeler · ${server.name}`;
    dialog.append(closeButton, title);
    if (!result.bannedUsers.length) {
      const empty = document.createElement("p");
      empty.className = "settings-note";
      empty.textContent = "Bu sunucuda yasaklı üye yok.";
      dialog.append(empty);
    }
    for (const bannedUser of result.bannedUsers) {
      const row = document.createElement("div");
      row.className = "banned-member-row";
      const name = document.createElement("span");
      name.textContent = bannedUser.username;
      const unban = document.createElement("button");
      unban.type = "button";
      unban.className = "dialog-cancel";
      unban.textContent = "Yasağı kaldır";
      unban.addEventListener("click", async () => {
        unban.disabled = true;
        try {
          await apiRequest(`/api/servers/${server.id}/bans/${bannedUser.id}`, { method: "DELETE" });
          dialog.close();
          await openBannedMembers(server);
          showToast(`${bannedUser.username} yasağı kaldırıldı`);
        } catch (error) {
          showToast(error.message);
        } finally {
          unban.disabled = false;
        }
      });
      row.append(name, unban);
      dialog.append(row);
    }
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (bannedMembersDialog === dialog) bannedMembersDialog = undefined;
      dialog.remove();
    }, { once: true });
    document.body.append(dialog);
    bannedMembersDialog = dialog;
    dialog.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

async function openModeratorView(server, memberId) {
  try {
    const result = await apiRequest(`/api/servers/${server.id}/members/${memberId}/moderation`);
    moderationDialog?.remove();
    const dialog = document.createElement("dialog");
    dialog.className = "create-server-dialog member-profile-dialog";
    dialog.setAttribute("aria-labelledby", "moderation-view-title");
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "dialog-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Kapat");
    closeButton.addEventListener("click", () => dialog.close());
    const title = document.createElement("h2");
    title.id = "moderation-view-title";
    title.textContent = "Mod Görünümü";
    const username = document.createElement("p");
    username.className = "moderation-view-name";
    username.textContent = result.member.nickname
      ? `${result.member.nickname} · ${result.member.username}`
      : result.member.username;
    const status = document.createElement("p");
    status.className = "settings-note";
    status.textContent = result.member.isOnline ? "Çevrim içi" : "Çevrim dışı";
    const userId = document.createElement("p");
    userId.className = "moderation-view-id";
    userId.textContent = `Kullanıcı kimliği: ${result.member.id}`;
    const roles = document.createElement("div");
    roles.className = "moderation-view-roles";
    if (result.member.roles.length) {
      for (const role of result.member.roles) {
        const badge = document.createElement("span");
        badge.textContent = role.name;
        badge.style.color = role.color;
        roles.append(badge);
      }
    } else {
      roles.textContent = "Özel rol atanmamış";
    }
    dialog.append(closeButton, title, username, status, userId, roles);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (moderationDialog === dialog) moderationDialog = undefined;
      dialog.remove();
    }, { once: true });
    document.body.append(dialog);
    moderationDialog = dialog;
    dialog.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

document.addEventListener("contextmenu", (event) => {
  if (!(event.target instanceof Element)) return;
  const memberElement = event.target.closest(".server-member, .channel-participant, .participant-card");
  if (!memberElement) return;
  event.preventDefault();
  showMemberContextMenu(getMemberContextTarget(memberElement), event.clientX, event.clientY);
});
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const memberElement = event.target.closest(".server-member");
  if (memberElement) {
    closeMemberContextMenu();
    showMemberProfile(getMemberContextTarget(memberElement));
    return;
  }
  if (memberContextMenu && !memberContextMenu.contains(event.target)) closeMemberContextMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMemberContextMenu();
    return;
  }
  if (!["Enter", " "].includes(event.key) || !(event.target instanceof Element)) return;
  const memberElement = event.target.closest(".server-member");
  if (!memberElement) return;
  event.preventDefault();
  showMemberProfile(getMemberContextTarget(memberElement));
});

document.querySelector("#toggle-members").addEventListener("click", () => {
  const isOpen = !workspaceLayout.classList.contains("members-open");
  setMembersPanelVisible(isOpen);
});
document.querySelector("#toggle-members-topbar").addEventListener("click", () => {
  setMembersPanelVisible(serverMembersPanel.hidden);
});

document.querySelector("#retry-chat").addEventListener("click", () => {
  if (!activeChat) return;
  openServerChat(activeChat.server, activeChat.channelId, activeChat.title);
});

function closeChatConnection() {
  setMembersPanelVisible(false);
  if (!chatSocket) return;
  const connection = chatSocket;
  chatSocket = undefined;
  chatReady = false;
  setChatReady(false);
  connection.close(1000, "Sohbet kapatıldı");
}

document.querySelector("#return-to-voice").addEventListener("click", () => {
  closeChatConnection();
  activeChat = undefined;
  chatView.hidden = true;
  dashboardContent.hidden = true;
  roomView.hidden = false;
  renderServers();
  document.querySelector(".workspace-location span:last-child").textContent =
    `${currentServer.name} · ${currentChannel.name}`;
});

function appendChatMessage(message) {
  chatMessages.querySelector(".chat-empty-state")?.remove();
  const article = document.createElement("article");
  article.className = "chat-message";
  const avatar = document.createElement("span");
  avatar.className = "chat-avatar";
  avatar.textContent = getInitials(message.name);
  const content = document.createElement("div");
  content.className = "chat-message-content";
  const metadata = document.createElement("div");
  metadata.className = "chat-message-meta";
  const author = document.createElement("strong");
  author.textContent = message.name;
  const timestamp = document.createElement("time");
  timestamp.dateTime = message.createdAt;
  timestamp.textContent = new Date(message.createdAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const text = document.createElement("p");
  appendChatMessageText(text, message.text);
  metadata.append(author, timestamp);
  content.append(metadata, text);
  article.append(avatar, content);
  chatMessages.append(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendChatMessageText(element, value) {
  const mentionedUsers = serverMembers.filter((member) => member.username);
  const usernames = [...new Set(mentionedUsers.map((member) => member.username))]
    .sort((a, b) => b.length - a.length);
  if (usernames.length === 0) {
    element.textContent = value;
    return;
  }
  const escapedUsernames = usernames.map((username) => username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const mentionPattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_-])(@(?:${escapedUsernames.join("|")}))(?=$|[^\\p{L}\\p{N}_-])`,
    "giu",
  );
  const usersByName = new Map(mentionedUsers.map((member) => [member.username.toLocaleLowerCase("tr"), member]));
  let cursor = 0;
  for (const match of value.matchAll(mentionPattern)) {
    const mentionStart = match.index + match[1].length;
    element.append(document.createTextNode(value.slice(cursor, mentionStart)));
    const username = match[2].slice(1);
    const member = usersByName.get(username.toLocaleLowerCase("tr"));
    if (!member) {
      element.append(document.createTextNode(match[2]));
    } else {
      const mention = document.createElement("span");
      mention.className = `chat-mention${member.id === accountUser?.id ? " is-self" : ""}`;
      mention.textContent = match[2];
      mention.title = `@${member.username}`;
      element.append(mention);
    }
    cursor = mentionStart + match[2].length;
  }
  element.append(document.createTextNode(value.slice(cursor)));
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (!chatReady || chatSocket?.readyState !== WebSocket.OPEN) {
    showToast("Sohbet bağlantısı hazır değil. Bağlantı kurulunca tekrar dene.");
    return;
  }
  chatSocket.send(JSON.stringify({ type: "chat-message", text }));
  chatInput.value = "";
});

async function copyServerInvite(server, channel = server.channels[0]) {
  const inviteUrl = new URL("/", location.href);
  inviteUrl.searchParams.set("invite", server.inviteCode);
  if (channel) inviteUrl.searchParams.set("channel", channel.id);
  try {
    await navigator.clipboard.writeText(inviteUrl.href);
    showToast("Sunucu davet bağlantısı kopyalandı");
  } catch {
    window.prompt("Bu bağlantıyı arkadaşlarınla paylaş:", inviteUrl.href);
  }
}

async function joinServerByCode(inviteCode) {
  const result = await apiRequest("/api/servers/join", {
    method: "POST",
    body: { inviteCode },
  });
  servers.set(result.server.id, result.server);
  selectedServer = result.server;
  renderServers();
  return result.server;
}

async function joinPendingServerInvite() {
  if (!serverInvite) return;
  await joinServerByCode(serverInvite);
  parameters.delete("invite");
  const query = parameters.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = joinForm.elements.name.value.trim();
  if (!name) return;
  await enterVoiceRoom({ name, room: roomCodeInput.value.trim() || createRoomCode() });
});

async function joinServerChannel(server, channel) {
  selectedServer = server;
  if (currentServer?.id === server.id && currentChannel?.id === channel.id && voiceActive) {
    closeChatConnection();
    chatView.hidden = true;
    dashboardContent.hidden = true;
    roomView.hidden = false;
    document.querySelector(".workspace-location span:last-child").textContent =
      `${server.name} · ${channel.name}`;
    activeChat = undefined;
    renderServers();
    return;
  }
  const name = displayName || accountUser?.username || joinForm.elements.name.value.trim();
  if (voiceActive) leaveRoom();
  await enterVoiceRoom({ name, server, channel });
}

async function enterVoiceRoom({ name = accountUser?.username || joinForm.elements.name.value.trim(), room, server, channel }) {
  if (!name) {
    showToast("Önce adını gir veya hesabınla giriş yap.");
    return;
  }
  displayName = name;
  currentServer = server;
  currentChannel = channel;
  currentRoom = room || undefined;
  if (server) renderServers();
  const submitButton = joinForm.querySelector("button");
  submitButton.disabled = true;
  joinButtonLabel.textContent = "Mikrofon hazırlanıyor…";
  roomNotice.hidden = true;

  try {
    rawMicrophoneStream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioInputConstraints(),
      video: false,
    });
    localStream = await createVoiceMicrophoneStream(rawMicrophoneStream);
  } catch (error) {
    rawMicrophoneStream?.getTracks().forEach((track) => track.stop());
    rawMicrophoneStream = undefined;
    voiceMicrophoneSource?.disconnect();
    voiceMicrophoneSource = undefined;
    voiceGainNode?.disconnect();
    voiceGainNode = undefined;
    submitButton.disabled = false;
    joinButtonLabel.textContent = roomCodeInput.value.trim() ? "Odaya katıl" : "Yeni oda oluştur";
    currentServer = undefined;
    currentChannel = undefined;
    renderServers();
    showToast(getMediaError(error));
    return;
  }

  voiceActive = true;
  closeChatConnection();
  activeChat = undefined;
  soundMuted = false;
  participantStates.set("self", { microphoneMuted: false, soundMuted: false, sharing: false, camera: false });
  try {
    startSpeakingMonitor("self", localStream);
  } catch (error) {
    console.warn("Konuşma algılama başlatılamadı:", error);
    showToast("Ses bağlantısı kuruldu ancak konuşma göstergesi kullanılamıyor.");
  }
  soundMutePreviousMicEnabled = undefined;
  document.querySelector(".dashboard-account").classList.add("has-voice");
  document.querySelector("#account-name").textContent = name;
  document.querySelector("#account-name").title = name;
  document.querySelector("#account-avatar").textContent = getInitials(name);
  landing.hidden = true;
  roomInWorkspace = Boolean(server);
  if (roomInWorkspace) {
    if (!accountUser) {
      servers.set(server.id, server);
      renderServers();
      dashboard.classList.add("is-guest");
    }
    dashboard.hidden = false;
    dashboardContent.hidden = true;
    chatView.hidden = true;
    topbar.hidden = true;
    document.querySelector(".workspace-location span:last-child").textContent = `${server.name} · ${channel.name}`;
  } else {
    document.querySelector(".call-bar").append(document.querySelector(".account-call-controls"));
    dashboard.hidden = true;
    topbar.hidden = false;
    chatView.hidden = true;
    document.querySelector(".shell").append(roomView);
  }
  roomView.hidden = false;
  document.querySelector("#room-title").textContent = server
    ? `${server.name} · ${channel.name}`
    : room;
  participantNames.set("self", displayName);
  renderParticipant("self", displayName, localStream);
  muteButton.disabled = false;
  soundMuteButton.disabled = false;
  shareButton.disabled = false;
  shareQuality.disabled = false;
  cameraButton.disabled = false;
  cameraQuality.disabled = false;
  document.querySelector("#leave-button").disabled = false;
  updateParticipantCount();
  connectToRoom();
}

function createRoomCode() {
  return `oda-${Math.random().toString(36).slice(2, 8)}`;
}

function connectToRoom() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const parameters = new URLSearchParams({ name: displayName });
  if (currentServer && currentChannel) {
    parameters.set("server", currentServer.id);
    parameters.set("channel", currentChannel.id);
  } else {
    parameters.set("room", currentRoom);
  }
  socket = new WebSocket(`${protocol}//${location.host}/signal?${parameters}`);
  socket.addEventListener("open", () => {
    if (authToken && currentServer) {
      socket.send(JSON.stringify({ type: "presence-auth", token: authToken }));
    }
    publishVoiceState();
    reconnecting = false;
    roomNotice.hidden = true;
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "server-members") {
      updateServerMemberPresence(message);
    } else if (message.type === "welcome") {
      clientId = message.clientId;
      for (const peer of message.peers) {
        participantNames.set(peer.id, peer.name);
        participantStates.set(peer.id, { microphoneMuted: false, soundMuted: false, sharing: false, camera: false });
        createPeerConnection(peer.id, peer.name, false);
      }
      updateParticipantCount();
    } else if (message.type === "peer-joined") {
      participantNames.set(message.peer.id, message.peer.name);
      participantStates.set(message.peer.id, { microphoneMuted: false, soundMuted: false, sharing: false, camera: false });
      createPeerConnection(message.peer.id, message.peer.name, true);
      updateParticipantCount();
      showToast(`${message.peer.name} odaya katıldı`);
    } else if (message.type === "voice-state") {
      participantStates.set(message.peerId, {
        microphoneMuted: message.microphoneMuted,
        soundMuted: message.soundMuted,
        sharing: message.sharing,
        camera: message.camera === true,
      });
      if (message.microphoneMuted || message.soundMuted) setParticipantSpeaking(message.peerId, false);
      renderParticipant(message.peerId, participantNames.get(message.peerId) || "Katılımcı", participantStreams.get(message.peerId));
      updateParticipantCount();
    } else if (message.type === "signal") {
      handleSignal(message.from, message.data);
    } else if (message.type === "peer-left") {
      removePeer(message.peerId);
    }
  });
  socket.addEventListener("close", (event) => {
    for (const [peerId] of peers) removePeer(peerId);
    if (!voiceActive) return;
    if (event.code === 1008 || event.code === 1013) {
      showRoomError(event.reason || "Odaya katılınamadı.");
      return;
    }
    if (!reconnecting) {
      reconnecting = true;
      showRoomError("Sunucu bağlantısı koptu. Oda tekrar yükleniyor…");
      window.setTimeout(() => {
        if (voiceActive) connectToRoom();
      }, 2000);
    }
  });
  socket.addEventListener("error", () => {
    showRoomError("Sunucuya bağlanılamadı. Sunucunun çalıştığını kontrol et.");
  });
}

function createPeerConnection(peerId, name, shouldOffer) {
  if (peers.has(peerId)) return peers.get(peerId).connection;
  const connection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) connection.addTrack(audioTrack, localStream);
  const screenTransceiver = connection.addTransceiver("video", { direction: "sendrecv" });
  const cameraTransceiver = connection.addTransceiver("video", { direction: "sendrecv" });
  const peer = {
    connection,
    screenTransceiver,
    cameraTransceiver,
    pendingCandidates: [],
  };
  peers.set(peerId, peer);
  if (screenTrack) screenTransceiver.sender.replaceTrack(screenTrack).catch((error) =>
    console.warn("Ekran paylaşımı yeni katılımcıya aktarılamadı:", error));
  if (cameraTrack) cameraTransceiver.sender.replaceTrack(cameraTrack).catch((error) =>
    console.warn("Kamera yeni katılımcıya aktarılamadı:", error));

  connection.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) sendSignal(peerId, { type: "candidate", candidate });
  });
  connection.addEventListener("track", ({ track, streams }) => {
    const stream = streams[0] || new MediaStream([track]);
    if (track.kind === "audio") {
      startSpeakingMonitor(peerId, stream);
      renderParticipant(peerId, name, stream);
      return;
    }
    const kind = screenTransceiver.receiver.track === track ? "screen" :
      cameraTransceiver.receiver.track === track ? "camera" : undefined;
    if (!kind) return;
    setParticipantVideoTrack(peerId, kind, track);
    track.addEventListener("ended", () => setParticipantVideoTrack(peerId, kind, undefined), { once: true });
  });
  connection.addEventListener("connectionstatechange", () => {
    if (connection.connectionState === "failed") showToast(`${name} ile bağlantı kurulamadı`);
  });

  if (shouldOffer) {
    connection.createOffer()
      .then((offer) => connection.setLocalDescription(offer))
      .then(() => sendSignal(peerId, { type: "offer", sdp: connection.localDescription }))
      .catch(() => showToast(`${name} için bağlantı başlatılamadı`));
  }
  return connection;
}

async function handleSignal(peerId, data) {
  const name = participantNames.get(peerId) || "Katılımcı";
  const connection = peers.get(peerId)?.connection || createPeerConnection(peerId, name, false);
  const peer = peers.get(peerId);
  try {
    if (data.type === "offer") {
      await connection.setRemoteDescription(data.sdp);
      for (const candidate of peer.pendingCandidates.splice(0)) await connection.addIceCandidate(candidate);
      await connection.setLocalDescription(await connection.createAnswer());
      sendSignal(peerId, { type: "answer", sdp: connection.localDescription });
    } else if (data.type === "answer") {
      await connection.setRemoteDescription(data.sdp);
      for (const candidate of peer.pendingCandidates.splice(0)) await connection.addIceCandidate(candidate);
    } else if (data.type === "candidate") {
      if (connection.remoteDescription) await connection.addIceCandidate(data.candidate);
      else peer.pendingCandidates.push(data.candidate);
    }
  } catch (error) {
    console.error("WebRTC sinyali işlenemedi:", error);
    showToast(`${name} ile bağlantı kurulamadı`);
  }
}

function sendSignal(peerId, data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "signal", to: peerId, data }));
  }
}

function getParticipantState(id) {
  if (id === "self") {
    return {
      microphoneMuted: !localStream?.getAudioTracks()[0]?.enabled,
      soundMuted,
      sharing: Boolean(screenTrack),
      camera: Boolean(cameraTrack),
    };
  }
  return participantStates.get(id) || { microphoneMuted: false, soundMuted: false, sharing: false, camera: false };
}

function createParticipantIndicators(state) {
  const indicators = document.createElement("span");
  indicators.className = "participant-status-icons";
  if (state.microphoneMuted) {
    const microphone = document.createElement("span");
    microphone.className = "participant-status-icon";
    microphone.title = "Mikrofon kapalı";
    microphone.setAttribute("aria-label", "Mikrofon kapalı");
    microphone.setAttribute("role", "img");
    microphone.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8M4 4l16 16"></path></svg>';
    indicators.append(microphone);
  }
  if (state.soundMuted) {
    const speaker = document.createElement("span");
    speaker.className = "participant-status-icon";
    speaker.title = "Hoparlör kapalı";
    speaker.setAttribute("aria-label", "Hoparlör kapalı");
    speaker.setAttribute("role", "img");
    speaker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9l5 6m0-6-5 6"></path></svg>';
    indicators.append(speaker);
  }
  if (state.sharing) {
    const sharing = document.createElement("span");
    sharing.className = "participant-sharing-badge";
    sharing.setAttribute("role", "img");
    sharing.setAttribute("aria-label", "Ekran yayını açık");
    sharing.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8m-4-4v4"></path></svg><span>YAYINDA</span>';
    indicators.append(sharing);
  }
  return indicators;
}

function publishVoiceState() {
  const state = getParticipantState("self");
  participantStates.set("self", state);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "voice-state", ...state }));
  }
  renderParticipant("self", displayName, localStream);
  updateParticipantCount();
}

function renderParticipant(id, name, stream) {
  let card = document.querySelector(`[data-participant="${CSS.escape(id)}"]`);
  if (!card) {
    card = document.createElement("article");
    card.className = "participant-card";
    card.dataset.participant = id;
    card.innerHTML = '<div class="participant-avatar"></div><div class="participant-name"></div>';
    grid.append(card);
  }
  if (stream) participantStreams.set(id, stream);
  card.classList.toggle("speaking", speakingParticipants.has(id));
  const voiceParticipant = serverVoiceParticipants.find((participant) => participant.clientId === id);
  card.classList.toggle("is-ignored", ignoredUserIds.has(voiceParticipant?.id || id));
  card.querySelector(".participant-avatar").textContent = getInitials(name);
  const nameLabel = card.querySelector(".participant-name");
  const participantName = document.createElement("span");
  participantName.textContent = name;
  nameLabel.replaceChildren(participantName, createParticipantIndicators(getParticipantState(id)));
  const state = getParticipantState(id);
  const tracks = participantVideoTracks.get(id) || {};
  const screenVideoTrack = state.sharing ? tracks.screen : undefined;
  const cameraVideoTrack = state.camera ? tracks.camera : undefined;
  card.classList.toggle("is-sharing", Boolean(screenVideoTrack));
  card.classList.toggle("has-camera", Boolean(cameraVideoTrack));
  grid.classList.toggle("has-screen-share", Boolean(grid.querySelector(".participant-card.is-sharing")));
  for (const [kind, track] of [["screen", screenVideoTrack], ["camera", cameraVideoTrack]]) {
    let video = card.querySelector(`video[data-video-kind="${kind}"]`);
    if (!track || track.readyState !== "live") {
      video?.remove();
      continue;
    }
    if (!video) {
      video = document.createElement("video");
      video.dataset.videoKind = kind;
      video.autoplay = true;
      video.playsInline = true;
      card.prepend(video);
    }
    video.muted = id === "self" || soundMuted;
    video.srcObject = new MediaStream([track]);
  }

  if (id !== "self" && stream?.getAudioTracks().length) {
    let audio = card.querySelector("audio");
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      card.append(audio);
    }
    audio.muted = soundMuted;
    audio.srcObject = stream;
    applyOutputSettings();
    audio.play().catch(() => showToast("Sesi duymak için sayfada bir kez dokun."));
  }
  updateParticipantCount();
}

function startSpeakingMonitor(id, stream) {
  const audioTracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
  if (audioTracks.length === 0) return;
  const trackKey = audioTracks.map((track) => track.id).join(",");
  if (speakingMonitors.get(id)?.trackKey === trackKey) return;
  stopSpeakingMonitor(id);
  try {
    if (!voiceAudioContext) voiceAudioContext = new AudioContext();
    const source = voiceAudioContext.createMediaStreamSource(stream);
    const analyser = voiceAudioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    speakingMonitors.set(id, {
      trackKey,
      source,
      analyser,
      samples: new Uint8Array(analyser.fftSize),
      lastActiveAt: 0,
    });
    if (!speakingMonitorTimer) speakingMonitorTimer = window.setInterval(updateSpeakingMonitors, 80);
    if (voiceAudioContext.state === "suspended") {
      voiceAudioContext.resume().catch((error) => {
        console.warn("Konuşma algılama başlatılamadı:", error);
      });
    }
  } catch (error) {
    console.warn("Konuşma algılama başlatılamadı:", error);
    showToast("Ses bağlantısı kuruldu ancak konuşma göstergesi kullanılamıyor.");
  }
}

function stopSpeakingMonitor(id) {
  const monitor = speakingMonitors.get(id);
  if (!monitor) return;
  monitor.source.disconnect();
  monitor.analyser.disconnect();
  speakingMonitors.delete(id);
  setParticipantSpeaking(id, false);
  if (speakingMonitors.size === 0 && speakingMonitorTimer) {
    window.clearInterval(speakingMonitorTimer);
    speakingMonitorTimer = undefined;
  }
}

function updateSpeakingMonitors() {
  const now = performance.now();
  for (const [id, monitor] of speakingMonitors) {
    const state = getParticipantState(id);
    if (state.microphoneMuted || state.soundMuted) {
      setParticipantSpeaking(id, false);
      continue;
    }
    monitor.analyser.getByteTimeDomainData(monitor.samples);
    let sumOfSquares = 0;
    for (const sample of monitor.samples) {
      const amplitude = (sample - 128) / 128;
      sumOfSquares += amplitude * amplitude;
    }
    const isSpeaking = Math.sqrt(sumOfSquares / monitor.samples.length) >= 0.025;
    if (isSpeaking) monitor.lastActiveAt = now;
    setParticipantSpeaking(id, isSpeaking || now - monitor.lastActiveAt < 180);
  }
}

function setParticipantSpeaking(id, isSpeaking) {
  if (isSpeaking) speakingParticipants.add(id);
  else speakingParticipants.delete(id);
  document.querySelector(`[data-participant="${CSS.escape(id)}"]`)?.classList.toggle("speaking", isSpeaking);
  document.querySelectorAll(`[data-participant-id="${CSS.escape(id)}"]`)
    .forEach((participant) => participant.classList.toggle("is-speaking", isSpeaking));
}

function getInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr") || "").join("");
}

function removePeer(peerId) {
  const peer = peers.get(peerId);
  if (peer) peer.connection.close();
  peers.delete(peerId);
  participantNames.delete(peerId);
  participantStates.delete(peerId);
  participantStreams.delete(peerId);
  participantVideoTracks.delete(peerId);
  stopSpeakingMonitor(peerId);
  speakingParticipants.delete(peerId);
  document.querySelector(`[data-participant="${CSS.escape(peerId)}"]`)?.remove();
  grid.classList.toggle("has-screen-share", Boolean(grid.querySelector(".participant-card.is-sharing")));
  updateParticipantCount();
}

function updateParticipantCount() {
  const count = grid.querySelectorAll(".participant-card").length;
  document.querySelector("#participant-count").textContent = `${count} kişi odada`;
  for (const list of serverList.querySelectorAll(".channel-participants")) {
    const server = servers.get(list.dataset.serverId);
    const channel = server?.channels.find((item) => item.id === list.dataset.channelId);
    if (server && channel) renderChannelParticipants(list, server, channel);
  }
}

muteButton.addEventListener("click", () => {
  const audioTrack = localStream?.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  muteButton.setAttribute("aria-pressed", String(!audioTrack.enabled));
  muteLabel.textContent = audioTrack.enabled ? "Mikrofon" : "Mikrofon kapalı";
  muteButton.setAttribute("aria-label", audioTrack.enabled ? "Mikrofonu kapat" : "Mikrofonu aç");
  muteButton.title = audioTrack.enabled ? "Mikrofonu kapat" : "Mikrofonu aç";
  publishVoiceState();
});

function updateSoundMuteControls() {
  const audioTrack = localStream?.getAudioTracks()[0];
  const microphoneMuted = !audioTrack?.enabled;
  muteButton.disabled = !voiceActive || soundMuted;
  muteButton.setAttribute("aria-pressed", String(microphoneMuted));
  muteLabel.textContent = microphoneMuted ? "Mikrofon kapalı" : "Mikrofon";
  muteButton.setAttribute("aria-label", microphoneMuted ? "Mikrofonu aç" : "Mikrofonu kapat");
  muteButton.title = microphoneMuted ? "Mikrofonu aç" : "Mikrofonu kapat";

  soundMuteButton.disabled = !voiceActive;
  soundMuteButton.setAttribute("aria-pressed", String(soundMuted));
  soundMuteLabel.textContent = soundMuted ? "Sesi aç" : "Mikrofonu ve hoparlörü kapat";
  soundMuteButton.setAttribute("aria-label", soundMuted ? "Mikrofonu ve hoparlörü aç" : "Mikrofonu ve hoparlörü kapat");
  soundMuteButton.title = soundMuted ? "Mikrofonu ve hoparlörü aç" : "Mikrofonu ve hoparlörü kapat";
}

soundMuteButton.addEventListener("click", () => {
  if (!voiceActive) return;
  const audioTrack = localStream?.getAudioTracks()[0];
  if (!soundMuted) {
    soundMutePreviousMicEnabled = audioTrack?.enabled ?? true;
    soundMuted = true;
    if (audioTrack) audioTrack.enabled = false;
  } else {
    soundMuted = false;
    if (audioTrack) audioTrack.enabled = soundMutePreviousMicEnabled ?? true;
    soundMutePreviousMicEnabled = undefined;
  }
  for (const audio of grid.querySelectorAll("audio")) audio.muted = soundMuted;
  for (const video of grid.querySelectorAll("video")) {
    video.muted = soundMuted || video.closest(".participant-card").dataset.participant === "self";
  }
  updateSoundMuteControls();
  publishVoiceState();
});

function selectedVideoConstraints(select) {
  const [height, frameRate] = select.value.split("-").map(Number);
  return {
    width: { ideal: height === 1080 ? 1920 : 1280 },
    height: { ideal: height },
    frameRate: { ideal: frameRate, max: frameRate },
  };
}

shareQuality.addEventListener("change", async () => {
  if (!screenTrack) return;
  try {
    await screenTrack.applyConstraints(selectedVideoConstraints(shareQuality));
  } catch (error) {
    showToast("Seçilen ekran paylaşım kalitesi bu kaynakta kullanılamıyor.");
    console.warn("Ekran paylaşım kalitesi değiştirilemedi:", error);
  }
});

cameraQuality.addEventListener("change", async () => {
  if (!cameraTrack) return;
  try {
    await cameraTrack.applyConstraints(selectedVideoConstraints(cameraQuality));
  } catch (error) {
    showToast("Seçilen kamera kalitesi bu cihazda kullanılamıyor.");
    console.warn("Kamera kalitesi değiştirilemedi:", error);
  }
});

shareButton.addEventListener("click", async () => {
  if (screenTrack) {
    stopScreenShare();
    return;
  }
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: selectedVideoConstraints(shareQuality),
      audio: false,
    });
    screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) {
      screenStream.getTracks().forEach((track) => track.stop());
      return;
    }
    await Promise.all(Array.from(peers.values(), ({ screenTransceiver }) =>
      screenTransceiver.sender.replaceTrack(screenTrack)));
    screenTrack.addEventListener("ended", stopScreenShare, { once: true });
    participantVideoTracks.set("self", { ...(participantVideoTracks.get("self") || {}), screen: screenTrack });
    shareButton.classList.add("is-sharing");
    shareLabel.textContent = "Paylaşımı durdur";
    shareButton.setAttribute("aria-label", "Ekran paylaşımını durdur");
    shareButton.title = "Ekran paylaşımını durdur";
    renderParticipant("self", displayName, localStream);
    publishVoiceState();
  } catch (error) {
    if (error.name !== "NotAllowedError") showToast("Ekran paylaşımı başlatılamadı.");
  }
});

function stopScreenShare() {
  if (!screenTrack) return;
  const track = screenTrack;
  screenTrack = undefined;
  track.stop();
  setParticipantVideoTrack("self", "screen", undefined);
  Promise.all(Array.from(peers.values(), ({ screenTransceiver }) => screenTransceiver.sender.replaceTrack(null)))
    .catch(() => showToast("Ekran paylaşımı durdurulurken bağlantı güncellenemedi."));
  shareButton.classList.remove("is-sharing");
  shareLabel.textContent = "Ekran paylaş";
  shareButton.setAttribute("aria-label", "Ekran paylaş");
  shareButton.title = "Ekran paylaş";
  renderParticipant("self", displayName, localStream);
  publishVoiceState();
}

cameraButton.addEventListener("click", async () => {
  if (cameraTrack) {
    const track = cameraTrack;
    cameraTrack = undefined;
    track.stop();
    await Promise.all(Array.from(peers.values(), ({ cameraTransceiver }) =>
      cameraTransceiver.sender.replaceTrack(null)));
    setParticipantVideoTrack("self", "camera", undefined);
    cameraButton.classList.remove("is-sharing");
    cameraLabel.textContent = "Kamerayı aç";
    cameraButton.setAttribute("aria-label", "Kamerayı aç");
    cameraButton.title = "Kamerayı aç";
    publishVoiceState();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: selectedVideoConstraints(cameraQuality),
      audio: false,
    });
    cameraTrack = stream.getVideoTracks()[0];
    if (!cameraTrack) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Kamera video akışı başlatılamadı.");
    }
    await Promise.all(Array.from(peers.values(), ({ cameraTransceiver }) =>
      cameraTransceiver.sender.replaceTrack(cameraTrack)));
    cameraTrack.addEventListener("ended", () => {
      if (cameraTrack) cameraButton.click();
    }, { once: true });
    participantVideoTracks.set("self", { ...(participantVideoTracks.get("self") || {}), camera: cameraTrack });
    cameraButton.classList.add("is-sharing");
    cameraLabel.textContent = "Kamerayı kapat";
    cameraButton.setAttribute("aria-label", "Kamerayı kapat");
    cameraButton.title = "Kamerayı kapat";
    publishVoiceState();
  } catch (error) {
    showToast(error.name === "NotAllowedError"
      ? "Kamera erişim izni verilmedi."
      : "Kamera açılamadı. Kamera iznini ve cihazını kontrol et.");
    console.warn("Kamera başlatılamadı:", error);
  }
});

document.querySelector("#copy-invite").addEventListener("click", async () => {
  if (currentServer) {
    await copyServerInvite(currentServer, currentChannel);
    return;
  }
  const inviteUrl = new URL("/", location.href);
  inviteUrl.searchParams.set("room", currentRoom);
  try {
    await navigator.clipboard.writeText(inviteUrl.href);
    showToast("Davet bağlantısı kopyalandı");
  } catch {
    window.prompt("Bu bağlantıyı arkadaşlarınla paylaş:", inviteUrl.href);
  }
});

function leaveRoom() {
  if (screenTrack) stopScreenShare();
  if (cameraTrack) {
    cameraTrack.stop();
    cameraTrack = undefined;
  }
  socket?.close(1000, "Odadan ayrıldı");
  voiceActive = false;
  document.querySelector(".dashboard-account").classList.remove("has-voice");
  closeChatConnection();
  activeChat = undefined;
  for (const [peerId] of peers) removePeer(peerId);
  localStream?.getTracks().forEach((track) => track.stop());
  rawMicrophoneStream?.getTracks().forEach((track) => track.stop());
  rawMicrophoneStream = undefined;
  localStream = undefined;
  stopSpeakingMonitor("self");
  voiceMicrophoneSource?.disconnect();
  voiceMicrophoneSource = undefined;
  voiceGainNode?.disconnect();
  voiceGainNode = undefined;
  voiceAudioContext?.close().catch((error) => console.warn("Ses algılama kaynağı kapatılamadı:", error));
  voiceAudioContext = undefined;
  participantNames.delete("self");
  participantStates.clear();
  participantStreams.clear();
  participantVideoTracks.clear();
  clientId = undefined;
  currentRoom = undefined;
  currentServer = undefined;
  currentChannel = undefined;
  renderServers();
  displayName = undefined;
  reconnecting = false;
  grid.replaceChildren();
  muteButton.disabled = true;
  soundMuteButton.disabled = true;
  shareButton.disabled = true;
  shareQuality.disabled = true;
  cameraButton.disabled = true;
  cameraQuality.disabled = true;
  muteButton.setAttribute("aria-pressed", "false");
  muteLabel.textContent = "Mikrofon";
  muteButton.setAttribute("aria-label", "Mikrofonu kapat");
  muteButton.title = "Mikrofonu kapat";
  soundMuted = false;
  soundMutePreviousMicEnabled = undefined;
  soundMuteButton.setAttribute("aria-pressed", "false");
  soundMuteLabel.textContent = "Mikrofonu ve hoparlörü kapat";
  soundMuteButton.setAttribute("aria-label", "Mikrofonu ve hoparlörü kapat");
  soundMuteButton.title = "Mikrofonu ve hoparlörü kapat";
  shareButton.classList.remove("is-sharing");
  shareLabel.textContent = "Ekran paylaş";
  shareButton.setAttribute("aria-label", "Ekran paylaş");
  shareButton.title = "Ekran paylaş";
  cameraButton.classList.remove("is-sharing");
  cameraLabel.textContent = "Kamerayı aç";
  cameraButton.setAttribute("aria-label", "Kamerayı aç");
  cameraButton.title = "Kamerayı aç";
  document.querySelector("#leave-button").disabled = true;
  landing.hidden = Boolean(accountUser);
  dashboard.hidden = !accountUser;
  const friendsPageActive = dashboard.classList.contains("is-friends") && !activeDirectMessage;
  dashboardContent.hidden = friendsPageActive || Boolean(activeDirectMessage);
  friendsView.hidden = !friendsPageActive;
  dmView.hidden = !activeDirectMessage;
  dashboard.classList.toggle("is-guest", !accountUser);
  topbar.hidden = Boolean(accountUser);
  roomView.hidden = true;
  chatView.hidden = true;
  document.querySelector("#return-to-voice").hidden = true;
  document.querySelector(".workspace-location span:last-child").textContent =
    activeDirectMessage?.username || (friendsPageActive ? "Arkadaşlar" : "Sesli odalar");
  document.querySelector(".dashboard-account").insertBefore(
    document.querySelector(".account-call-controls"),
    document.querySelector("#logout-button"),
  );
  document.querySelector(".workspace-main").append(roomView);
  roomInWorkspace = false;
  joinButton.disabled = false;
  joinButtonLabel.textContent = roomCodeInput.value.trim() ? "Odaya katıl" : "Yeni oda oluştur";
}

document.querySelector("#leave-button").addEventListener("click", leaveRoom);
document.querySelector("#leave-link").addEventListener("click", (event) => {
  event.preventDefault();
  leaveRoom();
});

function showRoomError(message) {
  roomNotice.textContent = message;
  roomNotice.hidden = false;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function getMediaError(error) {
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    return "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar dene.";
  }
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return "Mikrofon bulunamadı. Bir mikrofon bağlayıp tekrar dene.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Mikrofon erişimi için localhost veya HTTPS üzerinden aç.";
  }
  return "Mikrofon açılamadı. Tarayıcı izinlerini kontrol et.";
}

async function restoreAccount() {
  if (!authToken) return;
  let result;
  try {
    result = await apiRequest("/api/me");
  } catch (error) {
    if (error.status === 401) {
      showGuestAccount();
    } else {
      showToast("Hesap bilgisi sunucudan alınamadı. Bağlantını kontrol edip yenile.");
    }
    return;
  }
  accountUser = result.user;
  showAccount();
  try {
    await loadServers();
    await joinPendingServerInvite();
  } catch (error) {
    showToast(error.message);
  }
}

const parameters = new URLSearchParams(location.search);
setAuthMode("login");
const roomFromInvite = parameters.get("room");
if (roomFromInvite) {
  roomCodeInput.value = roomFromInvite.slice(0, 48);
  joinButtonLabel.textContent = "Odaya katıl";
}
const serverInvite = parameters.get("invite");
if (serverInvite) {
  document.querySelector("#server-invite-code").value = serverInvite.slice(0, 64);
  setAuthMode("register");
}
restoreAccount();
if (!authToken) showGuestAccount();
