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
let screenAudioTrack;
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
let serverRosterRevision = 0;
let globallyOnlineUsers = [];
let accountUser;
let selectedServer;
let friendData = { friends: [], incomingRequests: [], outgoingRequests: [], blockedUserIds: [] };
let directMessageUsers = [];
let directMessageGroups = [];
let dmPinsOpen = false;
const MAX_GROUP_MEMBERS = 10;
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
// Değiştirilmiş ama henüz kaydedilmemiş roller (izin düzenleme penceresi).
let channelPermissionDirty = new Set();
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

// Remote screen and camera tracks must be accessible to every voice handler.
function setParticipantVideoTrack(id, kind, track) {
  const tracks = participantVideoTracks.get(id) || {};
  if (track) tracks[kind] = track;
  else delete tracks[kind];
  if (Object.keys(tracks).length) participantVideoTracks.set(id, tracks);
  else participantVideoTracks.delete(id);
  renderParticipant(id, participantNames.get(id) || displayName || "Katılımcı", participantStreams.get(id));
  if (kind === "screen") refreshVcSharePreview(id);
}

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

// Original, short synthesized UI cues; no external audio files are needed.
const VC_CUES = {
  join: [[523, 0, .10], [784, .105, .13]],
  otherJoin: [[660, 0, .075], [880, .08, .11]],
  leave: [[660, 0, .085], [392, .09, .15]],
  otherLeave: [[587, 0, .075], [392, .08, .12]],
  share: [[440, 0, .075], [660, .08, .075], [988, .16, .15]],
  mention: [[880, 0, .09], [1175, .13, .17]],
};
function playVcCue(kind) {
  prepareNotificationAudio();
  const context = notificationAudioContext;
  if (!context || context.state !== "running") return;
  const start = context.currentTime + .008;
  for (const [frequency, offset, duration] of VC_CUES[kind] || []) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(.075, start + offset + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration + .01);
  }
}

// ---- Gelen arama zil sesleri (sesli ve görüntülü arama farklı çalar) ----
// Her desen: [frekans, başlangıç(sn), süre(sn)]; desen `period` saniyede bir tekrarlanır.
const RINGTONES = {
  // Sesli arama: klasik çift vuruşlu telefon zili.
  voice: { type: "sine", gain: .11, period: 3, notes: [
    [440, 0, .38], [480, 0, .38], [440, .5, .38], [480, .5, .38],
  ] },
  // Görüntülü arama: yükselen, melodik dörtlü.
  video: { type: "triangle", gain: .12, period: 2.4, notes: [
    [659.25, 0, .2], [783.99, .2, .2], [987.77, .4, .2], [1318.51, .6, .45],
  ] },
};

function startRingtone(kind) {
  const tone = RINGTONES[kind] || RINGTONES.voice;
  prepareNotificationAudio();
  const active = new Set();
  let timer;
  let stopped = false;
  const ring = () => {
    const context = notificationAudioContext;
    if (stopped || !context || context.state !== "running") return;
    const start = context.currentTime + .01;
    for (const [frequency, offset, duration] of tone.notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + offset + .02);
      gain.gain.setValueAtTime(tone.gain, start + offset + Math.max(.02, duration - .06));
      gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + duration + .02);
      active.add(oscillator);
      oscillator.addEventListener("ended", () => active.delete(oscillator));
    }
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    window.clearTimeout(autoStop);
    for (const oscillator of active) {
      try { oscillator.stop(); } catch { /* zaten durmuş */ }
    }
    active.clear();
  };
  ring();
  timer = window.setInterval(ring, tone.period * 1000);
  // Arayan 30 sn sonra vazgeçer; zil sesi sonsuza kadar çalmasın.
  const autoStop = window.setTimeout(stop, 30_000);
  return { stop };
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
  directMessageGroups = directMessages.groups || [];
  if (activeDirectMessage) {
    activeDirectMessage = activeDirectMessage.isGroup
      ? directMessageGroups.find((group) => group.id === activeDirectMessage.id) || activeDirectMessage
      : friendData.friends.find((friend) => friend.id === activeDirectMessage.id) ||
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
      setAvatar(avatar, friend);
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
      setAvatar(avatar, friend);
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
  const items = [
    ...directMessageGroups.map((group) => ({ item: group, time: group.lastMessageAt || group.createdAt || "" })),
    ...directMessageUsers.map((user) => ({ item: user, time: user.createdAt || "" })),
  ].sort((a, b) => b.time.localeCompare(a.time));
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "friends-sidebar-empty";
    empty.textContent = "Henüz bir direkt mesajın yok.";
    list.append(empty);
    return;
  }
  for (const { item: friend } of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "direct-message-link";
    button.classList.toggle("is-active", activeDirectMessage?.id === friend.id && !dmView.hidden);
    button.addEventListener("click", () => openDirectMessage(friend));
    const avatar = document.createElement("span");
    avatar.className = `friend-avatar${friend.isOnline && !friend.isGroup ? " is-online" : ""}`;
    setDmAvatar(avatar, friend);
    const name = document.createElement("span");
    name.textContent = friend.username;
    button.append(avatar, name);
    if (friend.isGroup) {
      const meta = document.createElement("span");
      meta.className = "direct-message-meta";
      meta.textContent = `${friend.members?.length || 0} üye`;
      button.append(meta);
    }
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
    setAvatar(avatar, friend);
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
  if (!accountUser || !friend?.id || (!friend.isGroup && !isFriend && !hasPermission)) return;
  closeDirectMessageConnection();
  activeDirectMessage = friend;
  dmPinsOpen = false;
  updateDmPinButton(0);
  friendsView.hidden = true;
  dashboardContent.hidden = true;
  roomView.hidden = true;
  chatView.hidden = true;
  dmView.hidden = false;
  document.querySelector("#friends-sidebar").hidden = false;
  document.querySelector("#friends-sidebar-home").classList.remove("is-active");
  updateDmHeader();
  dmMessages.replaceChildren();
  dmInput.value = initialMessage;
  dmInput.disabled = true;
  dmSend.disabled = true;
  renderDirectMessagesSidebar();
  connectDirectMessage(friend);
  const conversationId = dmConversationId(friend);
  acknowledgeNotifications(notifications
    .filter((item) => item.type === "direct-message" && item.sourceId === conversationId && !item.readAt)
    .map((item) => item.id))
    .catch((error) => showToast(error.message));
  syncDmCallPanel();
}

function connectDirectMessage(friend) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connection = new WebSocket(`${protocol}//${location.host}/dm?${friend.isGroup ? "group" : "user"}=${encodeURIComponent(friend.id)}`);
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
      messageState.dm.clear();
      for (const item of message.messages) appendDirectMessage(item);
      if (message.messages.length === 0) {
        const empty = document.createElement("p");
        empty.className = "dm-empty-state";
        empty.textContent = friend.isGroup
          ? `Bu, ${friend.username} grubunun başlangıcı.`
          : `Bu, ${friend.username} ile olan mesajlarının başlangıcı.`;
        dmMessages.append(empty);
      }
      dmInput.disabled = false;
      dmSend.disabled = false;
      if (dmInput.value.trim()) dmForm.requestSubmit();
      dmInput.focus();
    } else if (message.type === "dm-message") {
      appendDirectMessage(message.message);
    } else if (message.type === "message-change") {
      handleMessageChange("dm", message);
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

// Keep profile snapshots fresh even if a WebSocket update is missed.
const liveProfileCache = new Map();
let profileSyncRunning = false;
async function syncVisibleProfiles() {
  if (!accountUser || !authToken || profileSyncRunning || document.hidden) return;
  profileSyncRunning = true;
  try {
    const activeServerId = currentServer?.id || selectedServer?.id;
    const requests = [apiRequest("/api/dms")];
    if (activeServerId) requests.push(apiRequest(`/api/servers/${encodeURIComponent(activeServerId)}/members`));
    const results = await Promise.allSettled(requests);
    if (results[0].status === "fulfilled") {
      directMessageUsers = results[0].value.users || [];
      directMessageGroups = results[0].value.groups || directMessageGroups;
      if (activeDirectMessage?.isGroup) {
        const freshGroup = directMessageGroups.find((group) => group.id === activeDirectMessage.id);
        if (freshGroup) { activeDirectMessage = freshGroup; updateDmHeader(); }
      }
      for (const profile of directMessageUsers) applyLiveProfile(profile, true);
      renderDirectMessagesSidebar();
    }
    if (activeServerId && results[1]?.status === "fulfilled" &&
        (currentServer?.id === activeServerId || selectedServer?.id === activeServerId)) {
      updateServerMemberPresence({
        serverId: activeServerId,
        members: results[1].value.members || [],
        voiceParticipants: results[1].value.voiceParticipants || []
      });
      for (const profile of serverMembers) applyLiveProfile(profile, true);
    }
    if (activeDirectMessage) {
      const fresh = liveProfileCache.get(activeDirectMessage.id);
      if (fresh) {
        Object.assign(activeDirectMessage, fresh);
        document.querySelector("#dm-title").textContent = fresh.username;
        setAvatar(document.querySelector("#dm-avatar"), fresh);
      }
    }
    refreshDirectMessageProfiles();
    refreshChatMessageProfiles();
  } catch (error) {
    console.warn("Profil bilgileri yenilenemedi:", error);
  } finally { profileSyncRunning = false; }
}
window.setInterval(syncVisibleProfiles, 12000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncVisibleProfiles(); });

function resolveDirectMessageAuthor(message) {
  const id = message.senderId;
  const user = id === accountUser?.id ? accountUser :
    (liveProfileCache.get(id) || (id === activeDirectMessage?.id ? activeDirectMessage : null) ||
    friendData.friends.find((item) => item.id === id) || directMessageUsers.find((item) => item.id === id) ||
    activeDirectMessage?.members?.find((item) => item.id === id));
  return { username: user?.username || message.name || "Kullanıcı", avatar: user?.avatar ?? message.avatar ?? "" };
}

function refreshDirectMessageProfiles() {
  for (const article of dmMessages.querySelectorAll(".chat-message[data-sender-id]")) {
    const identity = resolveDirectMessageAuthor({ senderId: article.dataset.senderId, name: article.dataset.fallbackName });
    setAvatar(article.querySelector(".chat-avatar"), identity);
    const author = article.querySelector(".chat-message-meta strong");
    if (author) author.textContent = identity.username;
  }
}

function applyLiveProfile(profile, skipFullRender = false) {
  if (profile?.id) liveProfileCache.set(profile.id, { ...liveProfileCache.get(profile.id), ...profile });
  if (!profile?.id) return;
  if (accountUser?.id === profile.id) {
    accountUser = { ...accountUser, ...profile };
    displayName = profile.username;
    document.querySelector("#account-name").textContent = profile.username;
    setAvatar(document.querySelector("#account-avatar"), accountUser);
  }
  for (const collection of [friendData.friends, directMessageUsers, serverMembers]) {
    for (const user of collection) if (user.id === profile.id) Object.assign(user, profile);
  }
  for (const key of ["incomingRequests", "outgoingRequests"]) {
    for (const item of friendData[key] || []) if (item.user?.id === profile.id) Object.assign(item.user, profile);
  }
  if (activeDirectMessage?.id === profile.id) {
    Object.assign(activeDirectMessage, profile);
    document.querySelector("#dm-title").textContent = profile.username;
    setAvatar(document.querySelector("#dm-avatar"), profile);
    if (!dmView.hidden) document.querySelector(".workspace-location span:last-child").textContent = profile.username;
  }
  if (skipFullRender) return;
  renderDirectMessagesSidebar();
  if (!friendsView.hidden) renderFriends();
  refreshDirectMessageProfiles();
  refreshChatMessageProfiles();
  renderServerMembers();
  if (voiceActive) {
    renderParticipant("self", displayName || accountUser?.username || "Katılımcı", localStream);
    for (const [id, name] of participantNames) renderParticipant(id, name, participantStreams.get(id));
  }
}

let canManageChatMessages = false;
const messageState = { chat: new Map(), dm: new Map() };
function messagePinnedBar(kind) {
  const root = kind === "chat" ? chatMessages : dmMessages;
  const parent = root?.parentElement;
  if (!parent) return;
  let bar = parent.querySelector(`.vc-pinned-bar[data-kind="${kind}"]`);
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "vc-pinned-bar";
    bar.dataset.kind = kind;
    root.before(bar);
  }
  bar.replaceChildren();
  const pins = [...messageState[kind].values()].filter((item) => item.pinnedAt);
  if (kind === "dm") updateDmPinButton(pins.length);
  bar.hidden = !pins.length || (kind === "dm" && !dmPinsOpen);
  if (!pins.length) return;
  const title = document.createElement("strong");
  title.textContent = `📌 Sabitlenen mesajlar (${pins.length})`;
  bar.append(title);
  for (const pin of pins) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${pin.name || "Üye"}: ${pin.text.slice(0, 65)}`;
    button.addEventListener("click", () => {
      const target = [...root.querySelectorAll(".chat-message")].find((node) => node.dataset.messageId === pin.id);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("vc-highlight-message");
      setTimeout(() => target?.classList.remove("vc-highlight-message"), 1800);
    });
    bar.append(button);
  }
}
function handleMessageChange(kind, update) {
  const root = kind === "chat" ? chatMessages : dmMessages;
  if (update.action === "message-delete") messageState[kind].delete(update.messageId);
  else if (update.message?.id) messageState[kind].set(update.message.id, update.message);
  const node = [...root.querySelectorAll(".chat-message")].find((item) => item.dataset.messageId === update.messageId);
  if (update.action === "message-delete") node?.remove();
  else if (node && update.message) {
    const text = node.querySelector(".vc-message-text");
    if (text) {
      text.replaceChildren();
      if (kind === "chat") appendChatMessageText(text, update.message.text);
      else { text.textContent = update.message.text; linkifyMessageText(text); }
    }
    node.classList.toggle("vc-pinned-message", Boolean(update.message.pinnedAt));
    node.querySelector(".vc-edited-indicator")?.remove();
    if (update.message.editedAt) {
      const edited = document.createElement("small");
      edited.className = "vc-edited-indicator";
      edited.textContent = "(düzenlendi)";
      node.querySelector(".chat-message-meta")?.append(edited);
    }
  }
  messagePinnedBar(kind);
}
let openVcMessageMenu = null;
function closeVcMessageMenu() {
  if (!openVcMessageMenu) return;
  openVcMessageMenu.menu.remove();
  openVcMessageMenu.trigger.setAttribute("aria-expanded", "false");
  openVcMessageMenu = null;
}
document.addEventListener("pointerdown", (event) => {
  if (openVcMessageMenu && !openVcMessageMenu.menu.contains(event.target) &&
      !openVcMessageMenu.trigger.contains(event.target)) closeVcMessageMenu();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeVcMessageMenu(); });
window.addEventListener("resize", closeVcMessageMenu);
document.addEventListener("scroll", (event) => {
  if (openVcMessageMenu && !openVcMessageMenu.menu.contains(event.target)) closeVcMessageMenu();
}, true);
function attachMessageActions(article, message, kind) {
  if (!message.id) return;
  article.dataset.messageId = message.id;
  article.classList.toggle("vc-pinned-message", Boolean(message.pinnedAt));
  messageState[kind].set(message.id, message);
  const own = Boolean(accountUser && message.senderId === accountUser.id);
  const moderator = kind === "chat" && canManageChatMessages;
  if (!own && !moderator) return;
  if (article.querySelector(".vc-message-actions")) return;
  const holder = document.createElement("div");
  holder.className = "vc-message-actions";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "vc-message-menu-trigger";
  trigger.textContent = "⋯";
  trigger.setAttribute("aria-label", "Mesaj seçenekleri");
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (openVcMessageMenu?.trigger === trigger) { closeVcMessageMenu(); return; }
    closeVcMessageMenu();
    const menu = document.createElement("div");
    menu.className = "vc-message-menu";
    menu.setAttribute("role", "menu");
    const send = (type, extra = {}) => {
      const socket = kind === "chat" ? chatSocket : directMessageSocket;
      if (socket?.readyState !== WebSocket.OPEN) { showToast("Sohbet bağlantısı hazır değil."); return; }
      socket.send(JSON.stringify({ type, messageId: message.id, ...extra }));
    };
    const action = (icon, label, fn, danger = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      if (danger) button.className = "is-danger";
      const symbol = document.createElement("span");
      symbol.className = "vc-message-menu-icon";
      symbol.textContent = icon;
      const caption = document.createElement("span");
      caption.className = "vc-message-menu-label";
      caption.textContent = label;
      button.append(symbol, caption);
      button.addEventListener("click", () => { closeVcMessageMenu(); fn(); });
      menu.append(button);
    };
    if (own) action("✎", "Düzenle", async () => {
      const current = messageState[kind].get(message.id);
      const value = await vcPrompt("Yeni mesaj metnini yaz.", { title: "Mesajı düzenle", value: current?.text || "", multiline: true, confirmText: "Kaydet" });
      if (value !== null && value.trim()) send("message-edit", { text: value.trim() });
    });
    action("▤", "Sil", async () => { if (await vcConfirm("Bu mesaj kalıcı olarak silinecek.", { title: "Mesaj silinsin mi?", confirmText: "Sil", tone: "danger" })) send("message-delete"); }, true);
    action("📌", messageState[kind].get(message.id)?.pinnedAt ? "Sabitlemeyi kaldır" : "Başa tuttur", () => send("message-pin"));
    document.body.append(menu);
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    const top = rect.bottom + height + 6 <= window.innerHeight
      ? rect.bottom + 5 : Math.max(8, rect.top - height - 5);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    openVcMessageMenu = { menu, trigger };
    trigger.setAttribute("aria-expanded", "true");
  });
  holder.append(trigger);
  article.append(holder);
  // Mobil: mesaj üzerinde uzun basma ile aynı yetki kontrollü menüyü aç.
  // Masaüstündeki üç nokta butonu ve işlem mantığı değişmez.
  let longPressTimer = null;
  let startX = 0;
  let startY = 0;
  let suppressClick = false;
  const cancelLongPress = () => {
    if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    longPressTimer = null;
  };
  article.addEventListener("touchstart", (event) => {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    if (event.touches.length !== 1 || event.target.closest("button, a, input, textarea, select, .vc-message-menu")) return;
    cancelLongPress();
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      suppressClick = true;
      trigger.click();
      if (navigator.vibrate) navigator.vibrate(12);
    }, 520);
  }, { passive: true });
  article.addEventListener("touchmove", (event) => {
    if (longPressTimer === null) return;
    const touch = event.touches[0];
    if (!touch || Math.hypot(touch.clientX - startX, touch.clientY - startY) > 12) cancelLongPress();
  }, { passive: true });
  article.addEventListener("touchend", cancelLongPress, { passive: true });
  article.addEventListener("touchcancel", cancelLongPress, { passive: true });
  article.addEventListener("contextmenu", (event) => {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    event.preventDefault();
    cancelLongPress();
    if (!openVcMessageMenu || openVcMessageMenu.trigger !== trigger) trigger.click();
  });
  article.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}
const messageMenuAbort = new AbortController();
function ensureMessageRolePermission() {
  const form = document.querySelector("#server-role-form");
  if (!form || form.querySelector('input[name="permissions"][value="manage_messages"]')) return;
  const label = document.createElement("label");
  label.className = "vc-role-message-permission";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "permissions";
  checkbox.value = "manage_messages";
  const span = document.createElement("span");
  span.textContent = "Mesajları Yönet — Üyelerin mesajlarını silme ve sabitleme";
  label.append(checkbox, span);
  const permissionGroup = form.querySelector('input[name="permissions"]')?.parentElement?.parentElement;
  (permissionGroup || form).append(label);
}
ensureMessageRolePermission();

// Mesajlardaki HTTP(S) adreslerini güvenli, tıklanabilir bağlantılara dönüştür.
// HTML yorumlanmaz; kullanıcı metni yalnızca textContent/text node olarak işlenir.
function linkifyMessageText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const urlPattern = /https?:\/\/[^\s<>"'`]+/gi;
  for (const node of nodes) {
    if (node.parentElement?.closest("a, code, pre")) continue;
    const original = node.nodeValue;
    urlPattern.lastIndex = 0;
    let match;
    let cursor = 0;
    const fragment = document.createDocumentFragment();
    let changed = false;
    while ((match = urlPattern.exec(original)) !== null) {
      let raw = match[0];
      // Cümle sonunda bağlantıya ait olmayan noktalama işaretlerini ayır.
      while (/[.,!?;:]+$/.test(raw)) raw = raw.slice(0, -1);
      while (raw.endsWith(")") && (raw.match(/\(/g) || []).length < (raw.match(/\)/g) || []).length) raw = raw.slice(0, -1);
      if (!raw) continue;
      let url;
      try { url = new URL(raw); } catch { continue; }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const start = match.index;
      fragment.append(document.createTextNode(original.slice(cursor, start)));
      const anchor = document.createElement("a");
      anchor.href = url.href;
      anchor.textContent = raw;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer ugc nofollow";
      anchor.className = "vc-message-link";
      fragment.append(anchor);
      cursor = start + raw.length;
      changed = true;
    }
    if (changed) {
      fragment.append(document.createTextNode(original.slice(cursor)));
      node.replaceWith(fragment);
    }
  }
}

function appendDirectMessage(message) {
  dmMessages.querySelector(".dm-empty-state")?.remove();
  const article = document.createElement("article");
  article.className = `chat-message${message.senderId === accountUser?.id ? " is-own-message" : ""}`;
  article.dataset.messageId = message.id || "";
  const avatar = document.createElement("span");
  avatar.className = "chat-avatar";
  article.dataset.senderId = message.senderId || "";
  article.dataset.fallbackName = message.name || "";
  const identity = resolveDirectMessageAuthor(message);
  setAvatar(avatar, identity);
  const content = document.createElement("div");
  content.className = "chat-message-content";
  const metadata = document.createElement("div");
  metadata.className = "chat-message-meta";
  const author = document.createElement("strong");
  author.textContent = identity.username;
  const timestamp = document.createElement("time");
  timestamp.dateTime = message.createdAt;
  timestamp.textContent = new Date(message.createdAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const text = document.createElement("p");
  text.textContent = message.text;
  linkifyMessageText(text);
  text.classList.add("vc-message-text");
  metadata.append(author, timestamp);
  content.append(metadata, text);
  article.append(avatar, content);
  attachMessageActions(article, message, "dm");
  if (message.editedAt) { const edited = document.createElement("small"); edited.className = "vc-edited-indicator"; edited.textContent = "(düzenlendi)"; metadata.append(edited); }
  dmMessages.append(article);
  messagePinnedBar("dm");
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
    } else if (message.type === "profile-updated") {
      applyLiveProfile(message.profile);
    } else if (message.type === "presence-ready") {
      presenceReady = true;
      subscribeToSelectedServerPresence();
    } else if (message.type === "notification") {
      if (!message.notification?.id || notifications.some((item) => item.id === message.notification.id)) return;
      if (message.notification.type === "mention") playVcCue("mention");
      else playNotificationSound();
      notifications.push(message.notification);
      unreadNotificationCount += 1;
      updateNotificationBadge();
      const notification = message.notification;
      const activeConversationId = activeDirectMessage && accountUser
        ? dmConversationId(activeDirectMessage)
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
    } else if (message.type === "group-updated") {
      refreshDirectMessageGroups();
    } else if (message.type === "dm-call-state") {
      if (Array.isArray(message.participants) && message.participants.length > 0) {
        dmCallStates.set(message.conversationId, {
          callId: message.callId,
          video: message.video === true,
          participants: message.participants,
        });
      } else {
        dmCallStates.delete(message.conversationId);
      }
      renderDmCallBanner();
      if (voiceActive && dmCall?.conversationId === message.conversationId) {
        for (const [peerId, peerName] of participantNames) {
          if (peerId === "self" || !document.querySelector(`[data-participant="${CSS.escape(peerId)}"]`)) continue;
          renderParticipant(peerId, peerName, participantStreams.get(peerId));
        }
      }
    } else if (message.type === "call-invite") {
      if (!message.groupId && !friendData.friends.some((friend) => friend.id === message.fromUserId)) return;
      const isVideo = message.video === true;
      const caller = message.groupId
        ? `${message.fromName}, “${message.groupName || "Grup"}” grubunda`
        : message.fromName;
      const ringtone = startRingtone(isVideo ? "video" : "voice");
      const callTarget = message.groupId
        ? directMessageGroups.find((group) => group.id === message.groupId)
        : friendData.friends.find((friend) => friend.id === message.fromUserId);
      vcConfirm(`${caller} ${isVideo ? "görüntülü" : "sesli"} arama başlatmak istiyor. Katılmak ister misin?`, {
        title: isVideo ? "Gelen görüntülü arama" : "Gelen sesli arama",
        eyebrow: isVideo ? "GÖRÜNTÜLÜ ARAMA" : "SESLİ ARAMA",
        tone: "success", icon: isVideo ? "video" : "phone",
        confirmText: "Katıl", cancelText: "Reddet",
      }).then((accepted) => {
        ringtone.stop();
        if (connection.readyState === WebSocket.OPEN) {
          connection.send(JSON.stringify({
            type: "call-response",
            toUserId: message.fromUserId,
            callId: message.callId,
            groupId: message.groupId,
            accepted,
          }));
        }
        if (accepted) joinDirectCallRoom(message.callId, { video: isVideo, target: callTarget });
      });
    } else if (message.type === "call-invite-result") {
      const pendingCall = pendingCalls.get(message.callId);
      if (!pendingCall || message.delivered) return;
      window.clearTimeout(pendingCall.timer);
      pendingCalls.delete(message.callId);
      showToast(pendingCall.groupId
        ? "Gruptaki kimse şu anda çevrim içi değil"
        : `${pendingCall.friend.username} şu anda çevrim içi değil`);
    } else if (message.type === "call-response") {
      const pendingCall = pendingCalls.get(message.callId);
      if (!pendingCall) return;
      if (pendingCall.groupId && !message.accepted) {
        showToast(`${message.fromName || "Bir üye"} aramayı kabul etmedi`);
        return;
      }
      window.clearTimeout(pendingCall.timer);
      pendingCalls.delete(message.callId);
      if (message.accepted) joinDirectCallRoom(message.callId, { video: pendingCall.video, target: pendingCall.friend });
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
  dmCallStates.clear();
  renderDmCallBanner();
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

function startDirectCall(target, { video = false } = {}) {
  const isGroup = Boolean(target?.isGroup);
  if (presenceSocket?.readyState !== WebSocket.OPEN || (!isGroup && !target?.isOnline)) {
    showToast("Arama başlatmak için çevrim içi olup hazır olmalısın");
    return;
  }
  if (!isGroup && !friendData.friends.some((item) => item.id === target.id)) {
    showToast("Arama yalnızca arkadaşlarınla yapılabilir");
    return;
  }
  const callId = crypto.randomUUID();
  const timer = window.setTimeout(() => {
    if (!pendingCalls.has(callId)) return;
    pendingCalls.delete(callId);
    showToast(isGroup ? "Gruptan kimse aramaya yanıt vermedi" : `${target.username} aramaya yanıt vermedi`);
  }, 30_000);
  pendingCalls.set(callId, { friend: target, groupId: isGroup ? target.id : undefined, video, timer });
  presenceSocket.send(JSON.stringify({
    type: "call-invite",
    callId,
    video,
    ...(isGroup ? { groupId: target.id } : { toUserId: target.id }),
  }));
  const kind = video ? "görüntülü" : "sesli";
  showToast(isGroup
    ? `${target.username} grubuna ${kind} arama isteği gönderildi`
    : `${target.username} kullanıcısına ${kind} arama isteği gönderildi`);
}

async function joinDirectCallRoom(callId, { video = false, target } = {}) {
  const name = accountUser?.username || displayName || joinForm.elements.name.value.trim();
  if (voiceActive) leaveRoom();
  // Arama ayrı bir oda sayfası açmaz; ilgili DM'in içinde görünür.
  let dmConversation;
  if (target) {
    if (activeDirectMessage?.id !== target.id || dmView.hidden) openDirectMessage(target);
    if (!dmView.hidden && activeDirectMessage?.id === target.id) dmConversation = dmConversationId(target);
  }
  await enterVoiceRoom({ name, room: `call-${callId}`, dmConversation });
  // Görüntülü aramada odaya girer girmez kamera açılır.
  if (video && voiceActive && !cameraTrack && !cameraButton.disabled) cameraButton.click();
}

// ---- DM içi arama paneli ----
const dmCallSlot = document.querySelector("#dm-call-slot");
let dmCall;
// Sunucudan gelen aktif DM aramaları: conversationId -> { callId, video, participants }
const dmCallStates = new Map();

function dmCallUserByName(name) {
  const state = dmCall && dmCallStates.get(dmCall.conversationId);
  const fromState = state?.participants.find((item) => item.username === name);
  if (fromState) return { id: fromState.userId, username: fromState.username, avatar: fromState.avatar };
  const target = dmCall?.target;
  const pool = [target && !target.isGroup ? target : null, ...(target?.members || []), ...friendData.friends, ...directMessageUsers]
    .filter(Boolean);
  return pool.find((item) => item.username === name);
}

function renderDmCallBanner() {
  const banner = document.querySelector("#dm-call-banner");
  if (!banner) return;
  const conversationId = activeDirectMessage && accountUser ? dmConversationId(activeDirectMessage) : "";
  const state = conversationId ? dmCallStates.get(conversationId) : undefined;
  const others = state ? state.participants.filter((item) => item.userId !== accountUser.id) : [];
  const inThisCall = voiceActive && dmCall?.conversationId === conversationId;
  if (!state || others.length === 0 || dmView.hidden || inThisCall) {
    banner.hidden = true;
    banner.replaceChildren();
    return;
  }
  const avatars = document.createElement("div");
  avatars.className = "dm-call-banner-avatars";
  for (const person of others) {
    const avatar = document.createElement("span");
    avatar.className = "friend-avatar is-online";
    setAvatar(avatar, { username: person.username, avatar: person.avatar });
    avatar.title = person.username;
    avatars.append(avatar);
  }
  const text = document.createElement("div");
  text.className = "dm-call-banner-text";
  const title = document.createElement("strong");
  title.textContent = state.video ? "Görüntülü arama sürüyor" : "Sesli arama sürüyor";
  const names = document.createElement("span");
  names.textContent = `${others.map((item) => item.username).join(", ")} aramada`;
  text.append(title, names);
  const join = document.createElement("button");
  join.type = "button";
  join.className = "dm-call-banner-join";
  join.textContent = "Aramaya katıl";
  join.addEventListener("click", () => {
    if (!activeDirectMessage) return;
    joinDirectCallRoom(state.callId, { video: false, target: activeDirectMessage })
      .catch((error) => showToast(error.message));
  });
  banner.replaceChildren(avatars, text, join);
  banner.hidden = false;
}
const HANGUP_ICON = '<path d="M3.5 14.5c4.7-4 12.3-4 17 0l-1.6 2.9-3.4-.9v-2.4a10 10 0 0 0-6 0v2.4l-3.4.9z"></path>';

function setDmCallLeaveStyle(active) {
  const button = document.querySelector("#leave-button");
  const icon = button?.querySelector("svg");
  if (!button || !icon) return;
  icon.dataset.original ??= icon.innerHTML;
  icon.innerHTML = active ? HANGUP_ICON : icon.dataset.original;
  const label = active ? "Aramayı bitir" : "Odadan ayrıl";
  button.title = label;
  button.setAttribute("aria-label", label);
  const text = button.querySelector(".sr-only");
  if (text) text.textContent = label;
}

function syncDmCallPanel() {
  renderDmCallBanner();
  if (!dmCall || !voiceActive) return;
  const controls = document.querySelector(".account-call-controls");
  const showPanel = !dmView.hidden && activeDirectMessage &&
    dmConversationId(activeDirectMessage) === dmCall.conversationId;
  if (showPanel) {
    if (roomView.parentElement !== dmCallSlot) dmCallSlot.append(roomView);
    roomView.classList.add("is-dm-call");
    dmCallSlot.hidden = false;
    roomView.hidden = false;
    const bar = roomView.querySelector(".call-bar");
    if (controls && controls.parentElement !== bar) bar.append(controls);
    setDmCallLeaveStyle(true);
  } else {
    // Başka bir sohbete geçildi: arama sürer, kontroller sol alttaki hesap çubuğuna döner.
    roomView.hidden = true;
    dmCallSlot.hidden = true;
    const account = document.querySelector(".dashboard-account");
    if (controls && account && controls.parentElement !== account) {
      account.insertBefore(controls, document.querySelector("#logout-button"));
    }
    setDmCallLeaveStyle(false);
  }
}
new MutationObserver(syncDmCallPanel).observe(dmView, { attributes: true, attributeFilter: ["hidden"] });

async function refreshDirectMessageGroups() {
  if (!accountUser || !authToken) return;
  try {
    const result = await apiRequest("/api/dms");
    directMessageUsers = result.users || directMessageUsers;
    directMessageGroups = result.groups || [];
    if (activeDirectMessage?.isGroup) {
      const fresh = directMessageGroups.find((group) => group.id === activeDirectMessage.id);
      if (!fresh) {
        showToast("Bu gruptan ayrıldın");
        showFriendsView();
        return;
      }
      activeDirectMessage = fresh;
      updateDmHeader();
    }
    renderDirectMessagesSidebar();
  } catch (error) {
    console.warn("Grup listesi yenilenemedi:", error);
  }
}

// ---- DM başlığı: arama, sabitlenenler, kişi ekleme / grup kurma ----
document.querySelector("#dm-voice-call").addEventListener("click", () => {
  if (activeDirectMessage) startDirectCall(activeDirectMessage, { video: false });
});
document.querySelector("#dm-video-call").addEventListener("click", () => {
  if (activeDirectMessage) startDirectCall(activeDirectMessage, { video: true });
});
document.querySelector("#dm-pins").addEventListener("click", () => {
  const pinCount = [...messageState.dm.values()].filter((item) => item.pinnedAt).length;
  if (!pinCount) {
    showToast("Bu sohbette sabitlenmiş mesaj yok. Bir mesajın menüsünden sabitleyebilirsin.");
    return;
  }
  dmPinsOpen = !dmPinsOpen;
  messagePinnedBar("dm");
});
document.querySelector("#dm-add-member").addEventListener("click", () => openAddMembersDialog());
document.querySelector("#dm-leave-group").addEventListener("click", async () => {
  const group = activeDirectMessage;
  if (!group?.isGroup) return;
  const confirmed = await vcConfirm(`“${group.username}” grubundan ayrılmak istediğine emin misin?`, {
    title: "Gruptan ayrıl", tone: "danger", confirmText: "Ayrıl", cancelText: "Vazgeç",
  });
  if (!confirmed) return;
  try {
    await apiRequest(`/api/groups/${encodeURIComponent(group.id)}/leave`, { method: "POST", body: {} });
    directMessageGroups = directMessageGroups.filter((item) => item.id !== group.id);
    showFriendsView();
    showToast("Gruptan ayrıldın");
  } catch (error) {
    showToast(error.message);
  }
});

function pickGroupMembers({ candidates, title, message, confirmText, maxSelectable }) {
  return showVcModal((dialog, api) => {
    api.setCancelValue(null);
    const { body, actions } = vcModalCard(dialog, { icon: "user", tone: "info", eyebrow: "GRUP SOHBETİ", title, message });
    const picker = document.createElement("div");
    picker.className = "vc-member-picker";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "vc-modal-input";
    search.placeholder = "Arkadaşlarında ara";
    search.setAttribute("aria-label", "Arkadaşlarında ara");
    const list = document.createElement("ul");
    list.className = "vc-member-list";
    const counter = document.createElement("p");
    counter.className = "vc-member-count";
    const selected = new Set();
    const submit = vcModalButton(confirmText, "primary", () => api.close([...selected]));
    submit.disabled = true;
    const refresh = () => {
      counter.textContent = `${selected.size} / ${maxSelectable} kişi seçildi`;
      submit.disabled = selected.size === 0;
      for (const box of list.querySelectorAll("input")) {
        const full = selected.size >= maxSelectable && !box.checked;
        box.disabled = full;
        box.closest(".vc-member-row").classList.toggle("is-disabled", full);
      }
    };
    const render = () => {
      const query = search.value.trim().toLocaleLowerCase("tr");
      list.replaceChildren();
      const visible = candidates.filter((friend) => friend.username.toLocaleLowerCase("tr").includes(query));
      if (!visible.length) {
        const empty = document.createElement("li");
        empty.className = "vc-member-empty";
        empty.textContent = "Kullanıcı bulunamadı.";
        list.append(empty);
        return;
      }
      for (const friend of visible) {
        const row = document.createElement("li");
        const label = document.createElement("label");
        label.className = "vc-member-row";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = selected.has(friend.id);
        box.addEventListener("change", () => {
          if (box.checked) selected.add(friend.id); else selected.delete(friend.id);
          refresh();
        });
        const avatar = document.createElement("span");
        avatar.className = `friend-avatar${friend.isOnline ? " is-online" : ""}`;
        setAvatar(avatar, friend);
        const name = document.createElement("span");
        name.textContent = friend.username;
        label.append(box, avatar, name);
        row.append(label);
        list.append(row);
      }
      refresh();
    };
    search.addEventListener("input", render);
    picker.append(search, list, counter);
    body.append(picker);
    actions.append(vcModalButton("Vazgeç", "secondary", () => api.close(null)), submit);
    render();
    window.setTimeout(() => search.focus(), 30);
  });
}

async function openAddMembersDialog() {
  const target = activeDirectMessage;
  if (!target || !accountUser) return;
  const isGroup = Boolean(target.isGroup);
  if (!isGroup && !friendData.friends.some((friend) => friend.id === target.id)) {
    showToast("Grup kurmak için bu kişinin arkadaşın olması gerekir.");
    return;
  }
  const existingIds = new Set(isGroup ? target.members.map((member) => member.id) : [target.id]);
  const candidates = friendData.friends.filter((friend) => !existingIds.has(friend.id));
  const currentSize = isGroup ? target.members.length : 2;
  const maxSelectable = MAX_GROUP_MEMBERS - currentSize;
  if (maxSelectable <= 0) {
    showToast(`Bir grupta en fazla ${MAX_GROUP_MEMBERS} kişi olabilir.`);
    return;
  }
  if (!candidates.length) {
    showToast("Eklenebilecek başka arkadaşın yok.");
    return;
  }
  const picked = await pickGroupMembers({
    candidates,
    maxSelectable,
    title: isGroup ? "Gruba kişi ekle" : "Grup oluştur",
    message: isGroup
      ? `“${target.username}” grubuna eklemek istediğin arkadaşlarını seç.`
      : `${target.username} ile birlikte yeni bir grup sohbeti kurulur. Eklemek istediğin arkadaşlarını seç.`,
    confirmText: isGroup ? "Ekle" : "Grubu oluştur",
  });
  if (!picked?.length) return;
  try {
    if (isGroup) {
      const { group } = await apiRequest(`/api/groups/${encodeURIComponent(target.id)}/members`, {
        method: "POST", body: { userIds: picked },
      });
      directMessageGroups = directMessageGroups.map((item) => (item.id === group.id ? group : item));
      if (activeDirectMessage?.id === group.id) { activeDirectMessage = group; updateDmHeader(); }
      renderDirectMessagesSidebar();
      showToast(`${picked.length} kişi gruba eklendi`);
    } else {
      const { group } = await apiRequest("/api/groups", {
        method: "POST", body: { memberIds: [target.id, ...picked] },
      });
      directMessageGroups = [group, ...directMessageGroups.filter((item) => item.id !== group.id)];
      openDirectMessage(group);
      showToast("Grup sohbeti oluşturuldu");
    }
  } catch (error) {
    showToast(error.message);
  }
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

const forgotPasswordButton = document.querySelector("#forgot-password-button");
const forgotPasswordForm = document.querySelector("#forgot-password-form");
const resetPasswordForm = document.querySelector("#reset-password-form");
const resetToken = new URLSearchParams(window.location.search).get("reset_token");

function showRecoveryForm(which) {
  authForm.hidden = Boolean(which);
  document.querySelector(".auth-tabs").hidden = Boolean(which);
  forgotPasswordForm.hidden = which !== "forgot";
  resetPasswordForm.hidden = which !== "reset";
  forgotPasswordButton.hidden = Boolean(which);
}
forgotPasswordButton.addEventListener("click", () => {
  document.querySelector("#forgot-email").value = document.querySelector("#auth-email").value.includes("@")
    ? document.querySelector("#auth-email").value : "";
  showRecoveryForm("forgot");
});
document.querySelector("#forgot-back").addEventListener("click", () => showRecoveryForm(null));
forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = forgotPasswordForm.querySelector("button[type=submit]");
  const output = document.querySelector("#forgot-result");
  button.disabled = true;
  output.textContent = "Gönderiliyor...";
  try {
    const result = await apiRequest("/api/password/forgot", {
      method: "POST", body: { email: document.querySelector("#forgot-email").value.trim() }
    });
    output.textContent = result.message;
  } catch (error) {
    output.textContent = error.message;
  } finally { button.disabled = false; }
});
resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = resetPasswordForm.querySelector("button[type=submit]");
  const output = document.querySelector("#reset-result");
  button.disabled = true;
  try {
    const result = await apiRequest("/api/password/reset", {
      method: "POST", body: { token: resetToken, password: document.querySelector("#reset-password").value }
    });
    output.textContent = result.message;
    window.history.replaceState(null, "", window.location.pathname);
    resetPasswordForm.reset();
    setTimeout(() => { showRecoveryForm(null); setAuthMode("login"); }, 1800);
  } catch (error) { output.textContent = error.message; }
  finally { button.disabled = false; }
});
if (resetToken) showRecoveryForm("reset");

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
  forgotPasswordButton.hidden = registering;
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

function setAvatar(element, user) {
  if (!element) return;
  const avatar = user?.avatar || "";
  element.textContent = avatar ? "" : getInitials(user?.username || "");
  element.style.backgroundImage = avatar ? `url("${avatar}")` : "";
  element.classList.toggle("has-photo", Boolean(avatar));
}

const GROUP_AVATAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.3"></circle><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0M16 5.4a3.3 3.3 0 0 1 0 6.2M18 14.3a6 6 0 0 1 3.2 5.2"></path></svg>';

function setDmAvatar(element, item) {
  if (!element) return;
  const isGroup = Boolean(item?.isGroup);
  element.classList.toggle("is-group", isGroup);
  if (isGroup) {
    element.style.backgroundImage = "";
    element.classList.remove("has-photo");
    element.innerHTML = GROUP_AVATAR_ICON;
  } else {
    setAvatar(element, item);
  }
}

function dmConversationId(item) {
  return item.isGroup ? item.id : [accountUser.id, item.id].sort().join(":");
}

function updateDmHeader() {
  const item = activeDirectMessage;
  if (!item) return;
  document.querySelector("#dm-title").textContent = item.username;
  setDmAvatar(document.querySelector("#dm-avatar"), item);
  document.querySelector("#dm-status").textContent = item.isGroup
    ? `${item.members?.length || 0} üye`
    : (item.isOnline ? "Çevrim içi" : "Özel mesaj");
  document.querySelector("#dm-leave-group").hidden = !item.isGroup;
  document.querySelector("#dm-add-member").title = item.isGroup ? "Gruba kişi ekle" : "DM'ye kişi ekle";
  document.querySelector("#dm-add-member").setAttribute("aria-label", item.isGroup ? "Gruba kişi ekle" : "DM'ye kişi ekle");
  if (!dmView.hidden) document.querySelector(".workspace-location span:last-child").textContent = item.username;
}

function updateDmPinButton(count) {
  const button = document.querySelector("#dm-pins");
  const badge = document.querySelector("#dm-pin-count");
  if (!button || !badge) return;
  badge.hidden = count === 0;
  badge.textContent = String(count);
  button.classList.toggle("is-active", dmPinsOpen && count > 0);
  button.setAttribute("aria-pressed", String(dmPinsOpen && count > 0));
}

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
  setAvatar(document.querySelector("#account-avatar"), accountUser);
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
  directMessageGroups = [];
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

let pendingProfileAvatar = "";
const profileAvatarInput = document.querySelector("#profile-avatar-input");
profileAvatarInput.addEventListener("change", async () => {
  const file = profileAvatarInput.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showToast("PNG, JPEG veya WebP seç. Dosya 5 MB'dan küçük olmalı.");
    profileAvatarInput.value = "";
    return;
  }
  try {
    const image = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 160;
    const context = canvas.getContext("2d");
    const side = Math.min(image.width, image.height);
    context.drawImage(image, (image.width-side)/2, (image.height-side)/2, side, side, 0, 0, 160, 160);
    image.close();
    pendingProfileAvatar = canvas.toDataURL("image/jpeg", .75);
    setAvatar(document.querySelector("#profile-avatar-preview"), { avatar: pendingProfileAvatar });
    setAvatar(document.querySelector("#profile-edit-avatar"), { avatar: pendingProfileAvatar });
  } catch { showToast("Fotoğraf işlenemedi. Başka bir görsel dene."); }
});
document.querySelector("#profile-avatar-remove").addEventListener("click", () => {
  pendingProfileAvatar = "";
  profileAvatarInput.value = "";
  const profile = { username: profileEditForm.elements.username.value };
  setAvatar(document.querySelector("#profile-avatar-preview"), profile);
  setAvatar(document.querySelector("#profile-edit-avatar"), profile);
});

function openProfileEditor(profile) {
  profileAvatarInput.value = "";
  profileEditForm.elements.username.value = profile.username || "";
  profileEditForm.elements.bio.value = profile.bio || "";
  pendingProfileAvatar = profile.avatar || "";
  setAvatar(document.querySelector("#profile-edit-avatar"), profile);
  setAvatar(document.querySelector("#profile-avatar-preview"), profile);
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
        avatar: pendingProfileAvatar,
      },
    });
    accountUser = { ...accountUser, ...result.profile };
    displayName = accountUser.username;
    showAccount();
    applyLiveProfile(result.profile);
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

const audioPrefs = {
  noiseSuppression: true,
  echoCancellation: true,
  pushToTalk: false,
  pushToTalkKey: "",
  autoSensitivity: true,
  sensitivity: 70,
  testMonitor: true,
};
let voiceGate;
let pushToTalkHeld = false;
let pushToTalkCapturing = false;

function loadAudioPrefs() {
  const flag = (key, fallback) => {
    const raw = getAudioPreference(key);
    return raw === "" ? fallback : raw === "1";
  };
  audioPrefs.noiseSuppression = flag("noiseSuppression", true);
  audioPrefs.echoCancellation = flag("echoCancellation", true);
  audioPrefs.pushToTalk = flag("pushToTalk", false);
  audioPrefs.autoSensitivity = flag("autoSensitivity", true);
  audioPrefs.testMonitor = flag("testMonitor", true);
  audioPrefs.pushToTalkKey = getAudioPreference("pushToTalkKey");
  const sensitivity = Number(getAudioPreference("sensitivity", "70"));
  audioPrefs.sensitivity = Number.isFinite(sensitivity) ? Math.max(0, Math.min(100, sensitivity)) : 70;
}

function saveAudioFlag(key, value) {
  audioPrefs[key] = value;
  saveAudioPreference(key, value ? "1" : "0");
}

function getAudioInputConstraints() {
  const deviceId = getAudioPreference("inputDevice");
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: audioPrefs.echoCancellation,
    noiseSuppression: audioPrefs.noiseSuppression,
    autoGainControl: true,
  };
}

// Higher sensitivity means a lower RMS threshold.
function sensitivityToThreshold(sensitivity) {
  return 0.003 + 0.2 * (1 - sensitivity / 100) ** 2;
}

// Noise gate + push-to-talk. Reads audioPrefs live, so settings apply instantly.
function createVoiceGate(context, inputNode, outputNode) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const gain = context.createGain();
  gain.gain.value = 0;
  inputNode.connect(analyser);
  inputNode.connect(gain);
  gain.connect(outputNode);
  const samples = new Float32Array(analyser.fftSize);
  const gate = { open: false, level: 0, threshold: sensitivityToThreshold(audioPrefs.sensitivity), noiseFloor: 0.01, holdUntil: 0 };
  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += value * value;
    const rms = Math.sqrt(sum / samples.length);
    const now = performance.now();
    // Minimum tracker: falls fast to quieter input, rises slowly so speech does not raise it.
    gate.noiseFloor = rms < gate.noiseFloor
      ? gate.noiseFloor * 0.5 + rms * 0.5
      : Math.min(rms, gate.noiseFloor * 1.002, 0.08);
    gate.threshold = audioPrefs.autoSensitivity
      ? Math.max(0.012, gate.noiseFloor * 3 + 0.006)
      : sensitivityToThreshold(audioPrefs.sensitivity);
    gate.level = rms;
    let shouldOpen;
    if (audioPrefs.pushToTalk) {
      shouldOpen = pushToTalkHeld && Boolean(audioPrefs.pushToTalkKey);
    } else {
      if (rms >= gate.threshold) gate.holdUntil = now + 350;
      shouldOpen = now < gate.holdUntil;
    }
    if (shouldOpen !== gate.open) {
      gate.open = shouldOpen;
      gain.gain.setTargetAtTime(shouldOpen ? 1 : 0, context.currentTime, shouldOpen ? 0.01 : 0.06);
    }
  };
  const timer = window.setInterval(tick, 30);
  gate.destroy = () => {
    window.clearInterval(timer);
    try { inputNode.disconnect(analyser); inputNode.disconnect(gain); gain.disconnect(); } catch { /* already disconnected */ }
  };
  return gate;
}

function formatPushToTalkKey(code) {
  if (!code) return "Tuş Atanmamış";
  return ({ Space: "BOŞLUK", Backquote: "`", CapsLock: "CAPS LOCK", Tab: "TAB" }[code]) ||
    code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "NUM ").toLocaleUpperCase("tr");
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("textarea, select, [contenteditable], [role=textbox]")) return true;
  const input = target.closest("input");
  // Checkboxes, sliders and buttons do not take typed text, so push-to-talk still works there.
  return Boolean(input) && !["checkbox", "radio", "range", "button", "submit", "file", "color"].includes(input.type);
}

document.addEventListener("keydown", (event) => {
  if (pushToTalkCapturing) {
    event.preventDefault();
    event.stopImmediatePropagation();
    pushToTalkCapturing = false;
    if (event.key !== "Escape") {
      audioPrefs.pushToTalkKey = event.code;
      saveAudioPreference("pushToTalkKey", event.code);
    }
    updatePushToTalkControls();
    return;
  }
  if (!audioPrefs.pushToTalk || !audioPrefs.pushToTalkKey || event.code !== audioPrefs.pushToTalkKey) return;
  if (isTypingTarget(event.target)) return;
  pushToTalkHeld = true;
  if (event.repeat) event.preventDefault();
}, true);
document.addEventListener("keyup", (event) => {
  if (event.code === audioPrefs.pushToTalkKey) pushToTalkHeld = false;
}, true);
window.addEventListener("blur", () => { pushToTalkHeld = false; });

function updatePushToTalkControls() {
  document.querySelector("#audio-push-to-talk").checked = audioPrefs.pushToTalk;
  document.querySelector("#audio-ptt-row").hidden = !audioPrefs.pushToTalk;
  document.querySelector("#audio-ptt-key").textContent = pushToTalkCapturing
    ? "Bir tuşa bas…" : formatPushToTalkKey(audioPrefs.pushToTalkKey);
  document.querySelector("#audio-ptt-assign").textContent = pushToTalkCapturing
    ? "Dinleniyor…" : audioPrefs.pushToTalkKey ? "Tuşu Değiştir" : "Tuş Ata";
  document.querySelector("#audio-auto-sensitivity").disabled = audioPrefs.pushToTalk;
  document.querySelector("#audio-sensitivity").disabled = audioPrefs.pushToTalk || audioPrefs.autoSensitivity;
}

function syncAudioProcessingControls() {
  document.querySelector("#audio-noise-suppression").checked = audioPrefs.noiseSuppression;
  document.querySelector("#audio-echo-cancellation").checked = audioPrefs.echoCancellation;
  document.querySelector("#audio-auto-sensitivity").checked = audioPrefs.autoSensitivity;
  document.querySelector("#audio-test-monitor").checked = audioPrefs.testMonitor;
  document.querySelector("#audio-sensitivity").value = String(audioPrefs.sensitivity);
  document.querySelector("#audio-sensitivity-value").textContent = `${audioPrefs.sensitivity}%`;
  updatePushToTalkControls();
}
loadAudioPrefs();

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
  syncAudioProcessingControls();
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

const memberVolumes = new Map();
const memberGainNodes = new WeakMap();
let memberVolumeContext;
function getMemberVolume(id) {
  const raw = localStorage.getItem(`vc.memberVolume.${id}`);
  if (raw === null || raw === "") return 100;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored >= 0 && stored <= 200 ? stored : 100;
}
function setMemberVolume(id, level) {
  const value = Math.max(0, Math.min(200, Number(level) || 0));
  memberVolumes.set(id, value);
  localStorage.setItem(`vc.memberVolume.${id}`, String(value));
  applyMemberVolumes();
}
function applyMemberVolumes() {
  const master = getAudioVolumePreference("outputVolume", 100) / 100;
  for (const card of grid.querySelectorAll(".participant-card")) {
    const audio = card.querySelector("audio");
    if (!audio) continue;
    const level = (memberVolumes.get(card.dataset.participant) ?? getMemberVolume(card.dataset.participant)) / 100;
    const existing = memberGainNodes.get(audio);
    if (existing) {
      audio.volume = master;
      existing.gain.value = level;
    } else if (level <= 1) {
      audio.volume = master * level;
    } else {
      try {
        memberVolumeContext ||= new (window.AudioContext || window.webkitAudioContext)();
        const source = memberVolumeContext.createMediaElementSource(audio);
        const gain = memberVolumeContext.createGain();
        source.connect(gain); gain.connect(memberVolumeContext.destination);
        memberGainNodes.set(audio, gain);
        gain.gain.value = level;
        audio.volume = master;
        memberVolumeContext.resume().catch(() => {});
      } catch (error) {
        console.warn("%100 üzeri ses desteği kullanılamadı", error);
        audio.volume = master;
      }
    }
  }
}
function applyOutputSettings() {
  const sinkId = audioOutputDevice?.value || getAudioPreference("outputDevice");
  const outputVolume = getAudioVolumePreference("outputVolume", 100) / 100;
  for (const audio of document.querySelectorAll("audio")) {
    audio.volume = outputVolume;
    if (!sinkId || audio.dataset.sinkId === sinkId || typeof audio.setSinkId !== "function") continue;
    audio.setSinkId(sinkId).then(() => {
      audio.dataset.sinkId = sinkId;
    }).catch((error) => {
      console.warn("Hoparlör seçimi uygulanamadı:", error);
      showToast("Seçilen hoparlör kullanılamadı.");
    });
  }
  applyMemberVolumes();
}

// Apply saved audio preferences on startup (for global volumes)
function applySavedAudioPreferences() {
  const outputVolume = getAudioVolumePreference("outputVolume", 100) / 100;
  for (const audio of document.querySelectorAll("audio")) {
    audio.volume = outputVolume;
  }
  // Member volumes are applied when participants render via applyMemberVolumes()
}

// Call on startup to ensure volumes are applied early
applySavedAudioPreferences();

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
  voiceGate = createVoiceGate(voiceAudioContext, voiceGainNode, destination);
  return destination.stream;
}

async function switchVoiceMicrophone(silent = false) {
  let nextRawStream;
  let nextStream;
  const previousSource = voiceMicrophoneSource;
  const previousGain = voiceGainNode;
  const previousGate = voiceGate;
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
    previousGate?.destroy();
    previousSource?.disconnect();
    previousGain?.disconnect();
    localStream?.getTracks().forEach((track) => track.stop());
    rawMicrophoneStream?.getTracks().forEach((track) => track.stop());
    localStream = nextStream;
    rawMicrophoneStream = nextRawStream;
    startSpeakingMonitor("self", localStream);
    renderParticipant("self", displayName, localStream);
    if (!silent) showToast("Mikrofon değiştirildi");
  } catch (error) {
    nextStream?.getTracks().forEach((track) => track.stop());
    nextRawStream?.getTracks().forEach((track) => track.stop());
    if (voiceMicrophoneSource !== previousSource) voiceMicrophoneSource?.disconnect();
    if (voiceGainNode !== previousGain) voiceGainNode?.disconnect();
    if (voiceGate !== previousGate) voiceGate?.destroy();
    voiceMicrophoneSource = previousSource;
    voiceGainNode = previousGain;
    voiceGate = previousGate;
    showToast(getMediaError(error));
  }
}

let microphoneTestGate;
let microphoneTestMonitor;

function stopMicrophoneTest() {
  if (microphoneTestFrame) cancelAnimationFrame(microphoneTestFrame);
  microphoneTestFrame = undefined;
  microphoneTestGate?.destroy();
  microphoneTestGate = undefined;
  microphoneTestMonitor = undefined;
  microphoneTestStream?.getTracks().forEach((track) => track.stop());
  microphoneTestStream = undefined;
  microphoneTestContext?.close().catch((error) => console.warn("Mikrofon testi kapatılamadı:", error));
  microphoneTestContext = undefined;
  const meter = document.querySelector("#audio-input-meter");
  meter.style.width = "0%";
  meter.classList.remove("is-open");
  document.querySelector(".audio-level-meter").setAttribute("aria-valuenow", "0");
  document.querySelector("#audio-threshold-marker").style.left = "0";
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
    const sinkId = audioOutputDevice.value;
    if (sinkId && typeof microphoneTestContext.setSinkId === "function") {
      await microphoneTestContext.setSinkId(sinkId).catch((error) =>
        console.warn("Test çıkışı seçilemedi:", error));
    }
    await microphoneTestContext.resume();
    const source = microphoneTestContext.createMediaStreamSource(microphoneTestStream);
    const inputGain = microphoneTestContext.createGain();
    inputGain.gain.value = Number(audioInputVolume.value) / 100;
    // Same processing as the voice room: volume -> noise gate / push-to-talk -> output.
    microphoneTestMonitor = microphoneTestContext.createGain();
    microphoneTestMonitor.gain.value = audioPrefs.testMonitor ? 1 : 0;
    microphoneTestMonitor.connect(microphoneTestContext.destination);
    source.connect(inputGain);
    microphoneTestGate = createVoiceGate(microphoneTestContext, inputGain, microphoneTestMonitor);
    const meter = document.querySelector("#audio-input-meter");
    const marker = document.querySelector("#audio-threshold-marker");
    const meterContainer = document.querySelector(".audio-level-meter");
    document.querySelector("#microphone-test-button").textContent = "Testi Durdur";
    const updateMeter = () => {
      const gate = microphoneTestGate;
      if (!gate) return;
      const level = Math.min(100, Math.round(gate.level * 400));
      meter.style.width = `${level}%`;
      meter.classList.toggle("is-open", gate.open);
      marker.style.left = audioPrefs.pushToTalk ? "-10px" : `${Math.min(100, gate.threshold * 400)}%`;
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

async function reapplyMicrophoneProcessing() {
  if (microphoneTestStream) {
    stopMicrophoneTest();
    await startMicrophoneTest();
  }
  if (voiceActive) await switchVoiceMicrophone(true);
}
document.querySelector("#audio-noise-suppression").addEventListener("change", (event) => {
  saveAudioFlag("noiseSuppression", event.target.checked);
  reapplyMicrophoneProcessing();
});
document.querySelector("#audio-echo-cancellation").addEventListener("change", (event) => {
  saveAudioFlag("echoCancellation", event.target.checked);
  reapplyMicrophoneProcessing();
});
document.querySelector("#audio-push-to-talk").addEventListener("change", (event) => {
  saveAudioFlag("pushToTalk", event.target.checked);
  pushToTalkHeld = false;
  pushToTalkCapturing = false;
  updatePushToTalkControls();
  if (event.target.checked && !audioPrefs.pushToTalkKey) {
    pushToTalkCapturing = true;
    updatePushToTalkControls();
  }
});
document.querySelector("#audio-ptt-assign").addEventListener("click", () => {
  pushToTalkCapturing = !pushToTalkCapturing;
  updatePushToTalkControls();
});
document.querySelector("#audio-auto-sensitivity").addEventListener("change", (event) => {
  saveAudioFlag("autoSensitivity", event.target.checked);
  updatePushToTalkControls();
});
document.querySelector("#audio-sensitivity").addEventListener("input", (event) => {
  audioPrefs.sensitivity = Number(event.target.value);
  saveAudioPreference("sensitivity", String(audioPrefs.sensitivity));
  document.querySelector("#audio-sensitivity-value").textContent = `${audioPrefs.sensitivity}%`;
});
document.querySelector("#audio-test-monitor").addEventListener("change", (event) => {
  saveAudioFlag("testMonitor", event.target.checked);
  if (microphoneTestMonitor) microphoneTestMonitor.gain.value = event.target.checked ? 1 : 0;
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
  channelPermissionDirty = new Set();
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
          channelPermissionDirty.add(roleId);
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
// Değiştirilen tüm rollerin izinlerini sunucuya kaydeder. Bir şey kaydedildiyse true döner.
async function saveChannelPermissionEdits(server, channel) {
  if (!channelPermissionData || channelPermissionDirty.size === 0) return false;
  // Yanıt overwrites'ı tümden değiştireceği için istekler önce yerel veriden hazırlanır.
  const payloads = [...channelPermissionDirty].map((roleId) => ({
    roleId,
    overrides: Object.fromEntries(
      Object.keys(channelPermissionData.permissions).map((permission) => [
        permission,
        channelPermissionData.overwrites[roleId]?.[permission] || "inherit",
      ]),
    ),
  }));
  let last;
  for (const body of payloads) {
    last = await apiRequest(`/api/servers/${server.id}/channels/${channel.id}/permissions`, { method: "PATCH", body });
    channelPermissionDirty.delete(body.roleId);
  }
  if (last) channelPermissionData.overwrites = last.overwrites;
  return true;
}

document.querySelector("#save-channel-permissions").addEventListener("click", async (event) => {
  if (!pendingRename?.channel || !channelPermissionData) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    channelPermissionDirty.add(document.querySelector("#channel-permission-role").value);
    await saveChannelPermissionEdits(pendingRename.server, pendingRename.channel);
    renderChannelPermissions();
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
  // currentTarget, await sonrasında null olur; bu yüzden önce alınır.
  const button = event.currentTarget;
  if (!await vcConfirm(`“${channel.name}” odası ve sohbet geçmişi kalıcı olarak silinecek.`, { title: "Oda silinsin mi?", confirmText: "Odayı sil", tone: "danger" })) return;
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
  const categorySelect = document.querySelector("#channel-category");
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
    // "Kaydet" ile birlikte değiştirilmiş kanal izinleri de kaydedilsin.
    const permissionsSaved = channel ? await saveChannelPermissionEdits(server, channel) : false;
    renameDialog.close();
    pendingRename = undefined;
    showToast(permissionsSaved ? "Oda ayarları ve izinler kaydedildi" : channel ? "Oda adı güncellendi" : "Sunucu adı güncellendi");
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
    let inviteCode = form.elements.inviteCode.value.trim();
    try {
      const parsed = new URL(inviteCode);
      inviteCode = parsed.searchParams.get("invite") || inviteCode;
    } catch { /* Kod veya sunucu adı girildi. */ }
    const result = await apiRequest("/api/servers/join", {
      method: "POST",
      body: { inviteCode },
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
  document.querySelector("#leave-selected-server").disabled = !selectedServer || selectedServer.canDelete || !accountUser;
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
  const revisionAtRequest = serverRosterRevision;
  try {
    const result = await apiRequest(`/api/servers/${server.id}/members`);
    if (selectedServer?.id !== server.id || revisionAtRequest !== serverRosterRevision) return;
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
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showServerContextMenu(server, event.clientX, event.clientY);
    });
    guildList.append(button);
  }
}

function showServerContextMenu(server, x, y) {
  // Remove any existing context menu
  const existingMenu = document.querySelector(".server-context-menu");
  if (existingMenu) existingMenu.remove();

  const menu = document.createElement("div");
  menu.className = "server-context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const createMenuItem = (label, icon, onClick, disabled = false, danger = false) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "context-menu-item";
    if (disabled) item.disabled = true;
    if (danger) item.classList.add("danger");
    item.innerHTML = `<span class="context-menu-icon">${icon}</span><span>${label}</span>`;
    item.addEventListener("click", () => {
      menu.remove();
      onClick();
    });
    return item;
  };

  // Sunucu ayarları
  if (server.canManage) {
    menu.append(createMenuItem("Sunucu Ayarları", "⚙", () => {
      selectedServer = server;
      openServerSettings();
    }));
  }

  // Roller ve yetkiler
  if (server.canManageRoles) {
    menu.append(createMenuItem("Roller ve Yetkiler", "♙", () => {
      selectedServer = server;
      openServerRoles();
    }));
  }

  // Davet kodu oluştur
  if (server.canCreateInvite) {
    menu.append(createMenuItem("Davet Kodu Oluştur", "↗", async () => {
      selectedServer = server;
      try {
        const result = await apiRequest(`/api/servers/${server.id}/invite`, { method: "POST" });
        servers.set(result.server.id, result.server);
        selectedServer = result.server;
        renderServers();
        await copyServerInvite(result.server);
      } catch (error) {
        showToast(error.message);
      }
    }));
  }

  menu.append(document.createElement("hr"));

  // Bildirim ayarları
  menu.append(createMenuItem("Bildirim Ayarları", "🔔", () => {
    selectedServer = server;
    showServerNotificationSettings(server);
  }));

  menu.append(document.createElement("hr"));

  // Sunucudan ayrıl (not owner)
  if (!server.canDelete && accountUser) {
    menu.append(createMenuItem("Sunucudan Ayrıl", "⇥", async () => {
      if (!await vcConfirm(`“${server.name}” sunucusundan ayrılmak istiyor musun?`, { title: "Sunucudan ayrıl", confirmText: "Ayrıl", tone: "danger" })) return;
      try {
        await apiRequest(`/api/servers/${server.id}/leave`, { method: "POST" });
        if (currentServer?.id === server.id) leaveRoom();
        if (activeChat?.server?.id === server.id) {
          closeChatConnection();
          activeChat = undefined;
          chatView.hidden = true;
          dashboardContent.hidden = false;
        }
        servers.delete(server.id);
        if (selectedServer?.id === server.id) selectedServer = undefined;
        renderServers();
        if (selectedServer) showServerNavigation(selectedServer);
        else document.querySelector(".workspace-location span:last-child").textContent = "Sunucuların";
        showToast("Sunucudan ayrıldın");
      } catch (error) { showToast(error.message); }
    }));
  }

  // Sunucuyu sil (owner only)
  if (server.canDelete) {
    menu.append(createMenuItem("Sunucuyu Sil", "🗑", async () => {
      if (!await vcConfirm(`“${server.name}” sunucusu ve tüm kanalları/mesajları kalıcı olarak silinecek. Bu işlem geri alınamaz.`, { title: "Sunucu silinsin mi?", confirmText: "Sunucuyu sil", tone: "danger" })) return;
      try {
        await apiRequest(`/api/servers/${server.id}`, { method: "DELETE" });
        if (currentServer?.id === server.id) leaveRoom();
        if (activeChat?.server?.id === server.id) {
          closeChatConnection();
          activeChat = undefined;
          chatView.hidden = true;
          dashboardContent.hidden = false;
        }
        servers.delete(server.id);
        if (selectedServer?.id === server.id) selectedServer = undefined;
        if (currentServer?.id === server.id) currentServer = undefined;
        renderServers();
        showToast("Sunucu ve içeriği silindi");
      } catch (error) { showToast(error.message); }
    }, false, true));
  }

  document.body.append(menu);

  // Close menu on click outside
  const closeMenu = (event) => {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    }
  };
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.remove();
      document.removeEventListener("click", closeMenu);
    }
  });
}

function showServerNotificationSettings(server) {
  // Remove any existing dialog
  const existingDialog = document.querySelector("#server-notification-settings-dialog");
  if (existingDialog) existingDialog.remove();

  const dialog = document.createElement("dialog");
  dialog.id = "server-notification-settings-dialog";
  dialog.className = "create-server-dialog server-notification-settings-dialog";
  dialog.setAttribute("aria-labelledby", "notification-settings-title");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dialog-close";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Kapat");
  closeButton.addEventListener("click", () => dialog.close());

  const title = document.createElement("h2");
  title.id = "notification-settings-title";
  title.textContent = `Bildirim Ayarları · ${server.name}`;

  const content = document.createElement("div");
  content.className = "notification-settings-content";

  // Notification level options
  const levels = [
    { value: "all", label: "Tüm Mesajlar", desc: "Bu sunucudaki tüm mesajlardan bildirim al" },
    { value: "mentions", label: "Sadece @Bahsetmeler", desc: "Sadece senden bahsedildiğinde bildirim al" },
    { value: "none", label: "Hiçbiri", desc: "Bu sunucudan hiç bildirim alma" },
  ];

  // Get current setting (from localStorage)
  const currentSetting = localStorage.getItem(`oda.notifications.${server.id}`) || "mentions";

  for (const level of levels) {
    const option = document.createElement("label");
    option.className = "notification-level-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "notification-level";
    radio.value = level.value;
    radio.checked = level.value === currentSetting;
    radio.addEventListener("change", async () => {
      localStorage.setItem(`oda.notifications.${server.id}`, level.value);
      showToast(`Bildirim ayarı: ${level.label}`);
    });
    const label = document.createElement("span");
    label.className = "notification-level-label";
    label.innerHTML = `<strong>${level.label}</strong><small>${level.desc}</small>`;
    option.append(radio, label);
    content.append(option);
  }

  // Additional options
  const suppressRole = document.createElement("label");
  suppressRole.className = "notification-level-option checkbox-option";
  const suppressCheckbox = document.createElement("input");
  suppressCheckbox.type = "checkbox";
  suppressCheckbox.checked = localStorage.getItem(`oda.suppress-role.${server.id}`) === "true";
  suppressCheckbox.addEventListener("change", () => {
    localStorage.setItem(`oda.suppress-role.${server.id}`, suppressCheckbox.checked.toString());
    showToast(suppressCheckbox.checked ? "@rol bildirimleri gizlendi" : "@rol bildirimleri göster");
  });
  const suppressLabel = document.createElement("span");
  suppressLabel.className = "notification-level-label";
  suppressLabel.innerHTML = `<strong>@rol ve @everyone/@here bildirimlerini gizle</strong><small>Bu sunucudaki rol ve everyone/here etiketlerini yok say</small>`;
  suppressRole.append(suppressCheckbox, suppressLabel);
  content.append(suppressRole);

  const suppressAll = document.createElement("label");
  suppressAll.className = "notification-level-option checkbox-option";
  const suppressAllCheckbox = document.createElement("input");
  suppressAllCheckbox.type = "checkbox";
  suppressAllCheckbox.checked = localStorage.getItem(`oda.suppress-all.${server.id}`) === "true";
  suppressAllCheckbox.addEventListener("change", () => {
    localStorage.setItem(`oda.suppress-all.${server.id}`, suppressAllCheckbox.checked.toString());
    showToast(suppressAllCheckbox.checked ? "Tüm bildirimler gizlendi" : "Tüm bildirimler göster");
  });
  const suppressAllLabel = document.createElement("span");
  suppressAllLabel.className = "notification-level-label";
  suppressAllLabel.innerHTML = `<strong>Tüm bildirimleri gizle</strong><small>Bu sunucudan hiç bildirim almazsın (üstteki ayarı ezer)</small>`;
  suppressAll.append(suppressAllCheckbox, suppressAllLabel);
  content.append(suppressAll);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.className = "primary-button";
  doneButton.textContent = "Tamam";
  doneButton.addEventListener("click", () => dialog.close());
  actions.append(doneButton);

  dialog.append(closeButton, title, content, actions);
  document.body.append(dialog);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

document.querySelector("#leave-selected-server").addEventListener("click", async (event) => {
  const server = selectedServer;
  if (!server || server.canDelete || !accountUser) return;
  const leaveButton = event.currentTarget;
  if (!await vcConfirm(`“${server.name}” sunucusundan ayrılmak istiyor musun?`, { title: "Sunucudan ayrıl", confirmText: "Ayrıl", tone: "danger" })) return;
  leaveButton.disabled = true;
  try {
    await apiRequest(`/api/servers/${server.id}/leave`, { method: "POST" });
    if (currentServer?.id === server.id) leaveRoom();
    if (activeChat?.server.id === server.id) {
      closeChatConnection(); activeChat = undefined; chatView.hidden = true; dashboardContent.hidden = false;
    }
    servers.delete(server.id);
    if (selectedServer?.id === server.id) selectedServer = undefined;
    renderServers();
    if (selectedServer) showServerNavigation(selectedServer);
    else document.querySelector(".workspace-location span:last-child").textContent = "Sunucuların";
    showToast("Sunucudan ayrıldın");
  } catch (error) { showToast(error.message); }
  finally { leaveButton.disabled = false; renderServers(); }
});

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
  const button = event.currentTarget;
  if (!await vcConfirm(`“${server.name}” sunucusu ve tüm kanalları/mesajları kalıcı olarak silinecek. Bu işlem geri alınamaz.`, { title: "Sunucu silinsin mi?", confirmText: "Sunucuyu sil", tone: "danger" })) return;
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
  ensureMessageRolePermission();
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
  if (!await vcConfirm(`“${role.name}” rolü silinecek ve üyelerden kaldırılacak.`, { title: "Rol silinsin mi?", confirmText: "Rolü sil", tone: "danger" })) return;
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
  // The server snapshot is authoritative. Never resurrect peers from stale local maps.
  const visibleParticipants = participants;
  list.hidden = visibleParticipants.length === 0;

  // Check if current user can move members in this server
  const canMoveMembers = server.canMoveMembers && selectedServer?.id === server.id;

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
    participant.classList.toggle("is-speaking", speakingParticipants.has(participantId) ||
      (participantId === clientId && speakingParticipants.has("self")));

    // Add drag-and-drop for members if user has move_members permission
    if (canMoveMembers && member.id && !member.id.startsWith("guest:") && member.id !== accountUser?.id) {
      participant.draggable = true;
      participant.addEventListener("dragstart", (event) => {
        event.stopPropagation(); // Prevent channel drag handler from intercepting
        draggedLayoutItem = {
          kind: "member",
          userId: member.id,
          username: member.username,
          sourceChannelId: channel.id,
          serverId: server.id,
        };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", JSON.stringify(draggedLayoutItem));
        participant.classList.add("is-dragging");
      });
      participant.addEventListener("dragend", () => {
        participant.classList.remove("is-dragging");
        draggedLayoutItem = undefined;
      });
    }

    // Add right-click context menu for channel participants
    if (member.id && !member.id.startsWith("guest:") && member.id !== accountUser?.id) {
      participant.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log("[ContextMenu] Channel participant right-click", member);
        const target = {
          userId: member.id,
          username: member.username,
          clientId: member.clientId,
          server: server,
          isServerMember: true,
        };
        showMemberContextMenu(target, event.clientX, event.clientY);
      });
    } else {
      console.log("[ContextMenu] No context menu for participant:", member.id, member.id?.startsWith("guest:"), member.id === accountUser?.id);
    }

    const avatar = document.createElement("span");
    avatar.className = "channel-participant-avatar";
    setAvatar(avatar, member.avatar ? { avatar: member.avatar, username: name } : serverMembers.find((user) => user.id === member.id) || { username: name });
    const participantName = document.createElement("span");
    participantName.className = "channel-participant-name";
    participantName.textContent = name;
    // Presence snapshots carry voice status even when this client is not in the voice channel.
    const state = {
      microphoneMuted: member.id === accountUser?.id && voiceActive && currentServer?.id === server.id && currentChannel?.id === channel.id
        ? getParticipantState("self").microphoneMuted : member.microphoneMuted === true,
      soundMuted: member.id === accountUser?.id && voiceActive && currentServer?.id === server.id && currentChannel?.id === channel.id
        ? soundMuted : member.soundMuted === true,
      sharing: member.sharing === true, camera: false,
    };
    const indicators = createParticipantIndicators(state);
    participant.append(avatar, participantName, indicators);
    if (state.sharing) {
      const badge = indicators.querySelector(".participant-sharing-badge");
      if (badge) attachVcSharePreview(badge, participantId, name, server, channel);
    }
    list.append(participant);
  }
}

function updateServerMemberPresence(message) {
  if (message.serverId !== currentServer?.id && message.serverId !== selectedServer?.id) return;
  serverRosterRevision += 1;
  serverMembers = Array.isArray(message.members) ? message.members : [];
  serverVoiceParticipants = Array.isArray(message.voiceParticipants) ? message.voiceParticipants : [];
  serverVoiceParticipantsServerId = message.serverId;
  for (const participant of serverVoiceParticipants) {
    if (!participant.clientId || participant.clientId === clientId) continue;
    const previous = participantStates.get(participant.clientId) || {};
    participantStates.set(participant.clientId, {
      ...previous,
      microphoneMuted: participant.microphoneMuted === true,
      soundMuted: participant.soundMuted === true,
      sharing: participant.sharing === true,
    });
  }
  renderServerMembers();
  renderServers();
  refreshChatMessageProfiles();
  refreshDirectMessageProfiles();
  if (voiceActive) {
    renderParticipant("self", displayName || accountUser?.username || "Katılımcı", localStream);
    for (const [id, name] of participantNames) {
      renderParticipant(id, name, participantStreams.get(id));
    }
  }
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
    // Handle member drag: allow drop on voice channel entries
    if (draggedLayoutItem.kind === "member") {
      const channelEntry = event.target.closest(".channel-entry");
      if (channelEntry) {
        const channelButton = channelEntry.querySelector(".voice-channel-button");
        if (channelButton) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          channelList.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
          channelEntry.classList.add("is-drop-target");
        }
      }
      return;
    }
    // Handle channel/category drag
    const target = event.target.closest(".channel-entry, .channel-category");
    if (!target || target.classList.contains("is-dragging")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    channelList.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    target.classList.add("is-drop-target");
  });
  channelList.addEventListener("drop", (event) => {
    if (!draggedLayoutItem || draggedLayoutItem.serverId !== server.id) return;
    // Handle member drop on voice channel entry
    if (draggedLayoutItem.kind === "member") {
      const channelEntry = event.target.closest(".channel-entry");
      if (channelEntry) {
        const channelButton = channelEntry.querySelector(".voice-channel-button");
        if (channelButton) {
          event.preventDefault();
          const channelId = channelEntry.dataset.channelId;
          const list = channelEntry.querySelector(".channel-participants");
          if (list) {
            list.classList.remove("is-drop-target");
          }
          channelEntry.classList.remove("is-drop-target");
          moveMemberToChannel(server.id, draggedLayoutItem.userId, channelId, draggedLayoutItem.username);
        }
      }
      draggedLayoutItem = undefined;
      return;
    }
    // Ignore channel/category drop for member drag
    if (draggedLayoutItem.kind === "member") return;
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
      messageState.chat.clear();
      canManageChatMessages = Boolean(message.canManageMessages);
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
    } else if (message.type === "chat-cleared") {
      closeVcMessageMenu();
      chatMessages.replaceChildren();
      messageState.chat.clear();
      messagePinnedBar("chat");
      const emptyState = document.createElement("div");
      emptyState.className = "chat-empty-state";
      emptyState.textContent = "Bu sohbet sunucu sahibi tarafından temizlendi.";
      chatMessages.append(emptyState);
      showToast("Sohbet temizlendi.");
    } else if (message.type === "chat-message") {
      appendChatMessage(message.message);
    } else if (message.type === "message-change") {
      handleMessageChange("chat", message);
    } else if (message.type === "message-permissions") {
      canManageChatMessages = Boolean(message.canManageMessages);
      for (const [id, record] of messageState.chat) {
        const node = [...chatMessages.querySelectorAll(".chat-message")].find((item) => item.dataset.messageId === id);
        if (node && !node.querySelector(".vc-message-actions")) attachMessageActions(node, record, "chat");
      }
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
    onlineById.set(user.id, { ...user, ...serverMember, isOnline: true, isServerMember: true });
  }
  for (const member of serverMembers) {
    if (member.isOnline) {
      onlineById.set(member.id, { ...member, isServerMember: true });
    }
  }
  const ownerMember = serverMembers.find((member) => member.isOwner);
  if (ownerMember) onlineById.delete(ownerMember.id);
  const onlineMembers = Array.from(onlineById.values())
    .sort((left, right) => (left.nickname || left.username).localeCompare(right.nickname || right.username, "tr"));
  // Group online members by their top custom role (first in the server's role order).
  const roleOrder = new Map(serverRoleData.roles.map((role, index) => [role.id, index]));
  const customRolesOf = (member) => {
    const fromObjects = Array.isArray(member.roles) ? member.roles.filter((role) => !role.isDefault) : [];
    const known = new Map(serverRoleData.roles.map((role) => [role.id, role]));
    const fromIds = Array.isArray(member.roleIds)
      ? member.roleIds.map((id) => known.get(id)).filter((role) => role && !role.isDefault)
      : [];
    const merged = new Map();
    for (const role of [...fromObjects, ...fromIds]) merged.set(role.id, { ...known.get(role.id), ...role });
    return Array.from(merged.values())
      .sort((left, right) => (roleOrder.get(left.id) ?? 999) - (roleOrder.get(right.id) ?? 999));
  };
  const roleGroups = new Map();
  const regularOnlineMembers = [];
  for (const member of onlineMembers) {
    const [topRole] = customRolesOf(member);
    if (!topRole) {
      regularOnlineMembers.push(member);
      continue;
    }
    if (!roleGroups.has(topRole.id)) roleGroups.set(topRole.id, { role: topRole, members: [] });
    roleGroups.get(topRole.id).members.push(member);
  }
  const sortedRoleGroups = Array.from(roleGroups.values())
    .sort((left, right) => (roleOrder.get(left.role.id) ?? 999) - (roleOrder.get(right.role.id) ?? 999));
  const offlineMembers = serverMembers.filter((member) => !member.isOnline && !member.isOwner);
  document.querySelector("#server-member-count").textContent =
    String(onlineMembers.length + offlineMembers.length + (ownerMember ? 1 : 0));
  document.querySelector("#online-member-count").textContent = String(regularOnlineMembers.length);
  document.querySelector("#offline-member-count").textContent = String(offlineMembers.length);

  const fillMemberList = (members, list, emptyText) => {
    list.replaceChildren();
    if (members.length === 0) {
      const empty = document.createElement("p");
      empty.className = "server-members-empty";
      empty.textContent = emptyText;
      list.append(empty);
      return;
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
      avatar.className = "server-member-avatar";
      setAvatar(avatar, member);
      const name = document.createElement("span");
      name.className = "server-member-name";
      name.textContent = member.nickname || member.username;
      item.append(avatar, name);
      const [topRole] = customRolesOf(member);
      if (topRole?.color && /^#[0-9a-f]{3,8}$/i.test(topRole.color)) name.style.color = topRole.color;
      list.append(item);
    }
  };

  const ownerSection = document.querySelector("#owner-section");
  ownerSection.hidden = !ownerMember;
  if (ownerMember) {
    const ownerOnline = onlineById.has(ownerMember.id) || globallyOnlineUsers.some((user) => user.id === ownerMember.id) ||
      ownerMember.isOnline === true;
    fillMemberList([{ ...ownerMember, isOnline: ownerOnline }], document.querySelector("#owner-members"), "");
    document.querySelector("#owner-members .server-member")?.classList.toggle("is-offline", !ownerOnline);
  }

  const roleGroupsContainer = document.querySelector("#role-online-groups");
  roleGroupsContainer.replaceChildren();
  for (const { role, members } of sortedRoleGroups) {
    const section = document.createElement("section");
    section.className = "server-member-group role-online-group";
    const heading = document.createElement("h3");
    const roleName = document.createElement("span");
    roleName.className = "role-group-name";
    roleName.textContent = `${role.name} — ÇEVRİMİÇİ`;
    if (role.color && /^#[0-9a-f]{3,8}$/i.test(role.color)) roleName.style.color = role.color;
    const count = document.createElement("span");
    count.textContent = String(members.length);
    heading.append(roleName, count);
    const list = document.createElement("div");
    list.className = "server-member-list";
    section.append(heading, list);
    roleGroupsContainer.append(section);
    fillMemberList(members, list, "Çevrimiçi üye yok");
  }
  fillMemberList(regularOnlineMembers, onlineMembersList, "Çevrimiçi üye yok");
  fillMemberList(offlineMembers, offlineMembersList, "Çevrimdışı üye yok");
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
  avatar.classList.add("member-profile-avatar");
  setAvatar(avatar, profile);
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
  console.log("[ContextMenu] showMemberContextMenu called", target, x, y);
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
  const targetIsSelf = Boolean(
    (target.userId && target.userId === accountUser?.id) ||
    (target.clientId && target.clientId === clientId) ||
    target.clientId === "self"
  );
  const friend = friendData.friends.find((item) => item.id === target.userId);
  const hasFriendRequest = friendData.incomingRequests.some((request) => request.user.id === target.userId) ||
    friendData.outgoingRequests.some((request) => request.user.id === target.userId);
  const isBlocked = friendData.blockedUserIds.includes(target.userId);
  const isIgnored = ignoredUserIds.has(target.userId || `guest:${target.clientId}`);
  const server = target.server;

  if (!targetIsSelf && (target.userId || target.clientId)) {
    // The voice connection ID can be absent from the server's presence snapshot.
    // Resolve against the actual local voice peer first, then the current server roster.
    const matchingVoicePeople = serverVoiceParticipants.filter((person) =>
      (!server || server.id === serverVoiceParticipantsServerId) &&
      ((target.userId && person.id === target.userId) ||
       (target.clientId && person.clientId === target.clientId))
    );
    const peerCandidates = [
      target.clientId,
      ...matchingVoicePeople.map((person) => person.clientId),
    ].filter(Boolean);
    // If the roster is incomplete, use the name only when it uniquely matches
    // a live peer. This avoids changing the wrong person's volume.
    if (!peerCandidates.some((id) => peers.has(id)) && target.username) {
      const sameNamePeers = [...participantNames.entries()].filter(([id, name]) =>
        id !== clientId && name === target.username && peers.has(id));
      if (sameNamePeers.length === 1) peerCandidates.push(sameNamePeers[0][0]);
    }
    const voiceId = peerCandidates.find((id) => id !== clientId && id !== "self" && peers.has(id));
    if (voiceActive && voiceId && !targetIsSelf) {
      const volumeRow = document.createElement("div");
      volumeRow.className = "vc-member-volume";
      const label = document.createElement("label");
      const value = document.createElement("span");
      const slider = document.createElement("input");
      slider.type = "range"; slider.min = "0"; slider.max = "200"; slider.step = "5";
      slider.value = String(getMemberVolume(voiceId));
      label.textContent = "Kullanıcı Ses Düzeyi "; value.textContent = `${slider.value}%`;
      label.append(value); slider.setAttribute("aria-label", `${target.username} ses düzeyi`);
      slider.addEventListener("input", () => {
        value.textContent = `${slider.value}%`;
        setMemberVolume(voiceId, Number(slider.value));
      });
      volumeRow.append(label, slider); menu.append(volumeRow);
      addSeparator();
    }
  }
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
    addItem("Not Ekle / Düzenle", async () => {
      const key = `oda.memberNote.${accountUser.id}.${target.userId || target.username}`;
      const note = await vcPrompt(`“${target.username}” için yalnızca sana görünen not.`, { title: "Not ekle", icon: "user", value: localStorage.getItem(key) || "", multiline: true, confirmText: "Kaydet" });
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
      const nickname = await vcPrompt(`${target.username} için takma ad. Boş bırakırsan kaldırılır.`, { title: "Takma adı değiştir", icon: "user", value: currentNickname, maxLength: 32, confirmText: "Kaydet" });
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
      if (!await vcConfirm(`${target.username} arkadaş listenden çıkarılacak.`, { title: "Arkadaşlıktan çıkar", confirmText: "Çıkar", tone: "danger" })) return;
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
      if (isBlocked && !await vcConfirm(`${target.username} kullanıcısının engeli kaldırılacak.`, { title: "Engeli kaldır", confirmText: "Engeli kaldır", tone: "info", icon: "user" })) return;
      if (!isBlocked && !await vcConfirm(`${target.username} engellenecek. Arkadaşlık bağlantısı da kaldırılır.`, { title: "Kullanıcı engellensin mi?", confirmText: "Engelle", tone: "danger", icon: "user" })) return;
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
  // Add "Taşı" (Move) option for voice channel members
  if (server && target.isServerMember && target.userId && !targetIsSelf && server.canMoveMembers && voiceActive && currentServer?.id === server.id) {
    const voiceParticipant = serverVoiceParticipants.find((p) => p.id === target.userId);
    if (voiceParticipant && voiceParticipant.channelId) {
      addSeparator();
      const voiceChannels = server.channels.filter((c) => c.type === "voice" && c.id !== voiceParticipant.channelId);
      if (voiceChannels.length > 0) {
        const moveSubmenu = document.createElement("div");
        moveSubmenu.className = "member-context-menu-submenu";
        const moveButton = document.createElement("button");
        moveButton.type = "button";
        moveButton.className = "has-submenu";
        moveButton.setAttribute("role", "menuitem");
        moveButton.innerHTML = `⤴ Taşı <span class="submenu-arrow">▸</span>`;
        const submenuList = document.createElement("div");
        submenuList.className = "submenu-list";
        submenuList.setAttribute("role", "menu");
        for (const vc of voiceChannels) {
          const item = document.createElement("button");
          item.type = "button";
          item.setAttribute("role", "menuitem");
          item.textContent = vc.name;
          item.addEventListener("click", () => {
            closeMemberContextMenu();
            moveMemberToChannel(server.id, target.userId, vc.id, target.username);
          });
          submenuList.append(item);
        }
        moveButton.addEventListener("click", (e) => {
          e.stopPropagation();
          const isOpen = moveButton.classList.toggle("submenu-open");
          submenuList.style.display = isOpen ? "block" : "none";
        });
        moveSubmenu.append(moveButton, submenuList);
        document.querySelector(".member-context-menu").append(moveSubmenu);
      }
    }
  }
  if (server && target.isServerMember && target.userId && !targetIsSelf &&
    (server.canManageRoles || server.canManageNicknames || server.canKickMembers || server.canBanMembers)) {
    addItem("Mod Görünümünde Aç", () => openModeratorView(server, target.userId));
  }
  if (server && target.isServerMember && target.userId && !targetIsSelf && server.canKickMembers) {
    addSeparator();
    addItem("Sunucudan At", async () => {
      if (!await vcConfirm(`${target.username} bu sunucudan çıkarılacak.`, { title: "Sunucudan at", confirmText: "At", tone: "danger", icon: "user" })) return;
      await moderateServerMember(server, target, "kick");
    }, "is-danger");
  }
  if (server && target.isServerMember && target.userId && !targetIsSelf && server.canBanMembers) {
    addItem("Sunucudan Yasakla", async () => {
      if (!await vcConfirm(`${target.username} sunucudan çıkarılacak ve yeniden katılamayacak.`, { title: "Sunucudan yasakla", confirmText: "Yasakla", tone: "danger", icon: "user" })) return;
      await moderateServerMember(server, target, "ban");
    }, "is-danger");
  }
  if (server?.canBanMembers) {
    addItem("Yasaklı Üyeleri Yönet", () => openBannedMembers(server));
  }
  console.log("[ContextMenu] Appending menu to body");
  document.body.append(menu);
  // Position at click first, then adjust if off-screen
  requestAnimationFrame(() => {
    // Initial position at click
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Now measure and clamp to viewport
    const bounds = menu.getBoundingClientRect();
    let left = Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8));
    let top = Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8));

    // Check if submenu would go off-screen to the right
    const submenu = menu.querySelector(".member-context-menu-submenu");
    if (submenu) {
      const submenuBounds = submenu.getBoundingClientRect();
      const submenuRight = left + bounds.width + submenuBounds.width;
      if (submenuRight > window.innerWidth - 8) {
        // Open submenu to the left instead
        submenu.style.left = "auto";
        submenu.style.right = "100%";
        submenu.style.marginLeft = "0";
        submenu.style.marginRight = "4px";
      }
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.querySelector("button")?.focus();
  });
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

async function moveMemberToChannel(serverId, userId, targetChannelId, username) {
  try {
    await apiRequest(`/api/servers/${serverId}/members/${userId}/move`, {
      method: "POST",
      body: { channelId: targetChannelId },
    });
    // Update local voice participants to reflect the move immediately
    const participant = serverVoiceParticipants.find((p) => p.id === userId);
    if (participant) {
      participant.channelId = targetChannelId;
    }
    renderServers();
    showToast(`${username} "${targetChannelId}" kanalına taşındı`);
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
  if (!memberElement) {
    console.log("[ContextMenu] No matching element found", event.target);
    return;
  }
  event.preventDefault();
  console.log("[ContextMenu] Right-click on", memberElement.className, memberElement);
  try {
    const target = getMemberContextTarget(memberElement);
    console.log("[ContextMenu] Target:", target);
    // Ensure username is never empty
    if (!target.username) {
      target.username = memberElement.textContent.trim() || "Kullanıcı";
    }
    showMemberContextMenu(target, event.clientX, event.clientY);
  } catch (error) {
    console.error("[ContextMenu] Error:", error);
    // Fallback: show basic context menu
    showMemberContextMenu({
      username: memberElement.textContent.trim() || "Kullanıcı",
      userId: memberElement.dataset.userId,
      clientId: memberElement.dataset.participantId || memberElement.dataset.participant,
      server: currentServer,
      isServerMember: memberElement.dataset.serverMember === "true"
    }, event.clientX, event.clientY);
  }
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

function resolveChatAuthor(message) {
  const member = message.senderId ? serverMembers.find((item) => item.id === message.senderId) : null;
  const cached = message.senderId ? liveProfileCache.get(message.senderId) : null;
  const user = message.senderId === accountUser?.id ? accountUser : null;
  return {
    userId: message.senderId || null,
    username: member?.username || cached?.username || user?.username || message.username || message.name || "Misafir",
    nickname: member?.nickname || "",
    avatar: member?.avatar ?? cached?.avatar ?? user?.avatar ?? message.avatar ?? "",
  };
}

function refreshChatMessageProfiles() {
  if (!chatMessages) return;
  for (const article of chatMessages.querySelectorAll(".chat-message[data-message-id]")) {
    const authorInfo = resolveChatAuthor({
      senderId: article.dataset.senderId || null,
      name: article.dataset.fallbackName,
    });
    const avatar = article.querySelector(".chat-avatar");
    const name = article.querySelector(".chat-message-meta strong");
    if (avatar) setAvatar(avatar, authorInfo);
    if (name) name.textContent = authorInfo.nickname || authorInfo.username;
    article.dataset.currentUsername = authorInfo.username;
  }
}

function appendChatMessage(message) {
  chatMessages.querySelector(".chat-empty-state")?.remove();
  const article = document.createElement("article");
  article.className = "chat-message";
  article.dataset.messageId = message.id || "unknown";
  article.dataset.senderId = message.senderId || "";
  article.dataset.fallbackName = message.name || "";
  const identity = resolveChatAuthor(message);
  const avatar = document.createElement("span");
  avatar.className = "chat-avatar";
  setAvatar(avatar, identity);
  const content = document.createElement("div");
  content.className = "chat-message-content";
  const metadata = document.createElement("div");
  metadata.className = "chat-message-meta";
  const author = document.createElement("strong");
  author.textContent = identity.nickname || identity.username;
  const openAuthorProfile = () => {
    if (identity.userId) showMemberProfile({ userId: identity.userId, username: article.dataset.currentUsername || identity.username });
  };
  if (identity.userId) {
    avatar.classList.add("chat-profile-link");
    author.classList.add("chat-profile-link");
    avatar.setAttribute("role", "button");
    avatar.tabIndex = 0;
    author.tabIndex = 0;
    avatar.addEventListener("click", openAuthorProfile);
    author.addEventListener("click", openAuthorProfile);
    for (const element of [avatar, author]) element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAuthorProfile(); }
    });
  }
  const timestamp = document.createElement("time");
  timestamp.dateTime = message.createdAt;
  timestamp.textContent = new Date(message.createdAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit", minute: "2-digit",
  });
  const text = document.createElement("p");
  appendChatMessageText(text, message.text);
  text.classList.add("vc-message-text");
  metadata.append(author, timestamp);
  content.append(metadata, text);
  article.append(avatar, content);
  attachMessageActions(article, message, "chat");
  if (message.editedAt) { const edited = document.createElement("small"); edited.className = "vc-edited-indicator"; edited.textContent = "(düzenlendi)"; metadata.append(edited); }
  chatMessages.append(article);
  messagePinnedBar("chat");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendChatMessageText(element, value) {
  const mentionedUsers = serverMembers.filter((member) => member.username);
  const usernames = [...new Set(mentionedUsers.map((member) => member.username))]
    .sort((a, b) => b.length - a.length);
  if (usernames.length === 0) {
    element.textContent = value;
    linkifyMessageText(element);
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
  linkifyMessageText(element);
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (!chatReady || chatSocket?.readyState !== WebSocket.OPEN) {
    showToast("Sohbet bağlantısı hazır değil. Bağlantı kurulunca tekrar dene.");
    return;
  }
  if (text === "/clear") {
    if (!await vcConfirm("Bu kanaldaki TÜM mesajlar kalıcı olarak silinecek. Bu işlem geri alınamaz.", { title: "Tüm mesajlar silinsin mi?", confirmText: "Hepsini sil", tone: "danger" })) return;
    chatSocket.send(JSON.stringify({ type: "chat-clear" }));
  } else {
    chatSocket.send(JSON.stringify({ type: "chat-message", text }));
  }
  chatInput.value = "";
});

function showInviteCodeDialog(inviteCode, serverName) {
  const overlay = document.createElement("div");
  overlay.className = "vc-invite-overlay";
  const panel = document.createElement("div");
  panel.className = "vc-invite-panel";
  const title = document.createElement("h2");
  title.textContent = "Sunucu daveti";
  const description = document.createElement("p");
  description.textContent = `“${serverName}” sunucusuna katılmak için bu kodu veya sunucu adını gir.`;
  const code = document.createElement("input");
  code.readOnly = true;
  code.value = inviteCode;
  code.setAttribute("aria-label", "7 karakterlik davet kodu");
  const buttons = document.createElement("div");
  buttons.className = "vc-invite-actions";
  const copyCode = document.createElement("button");
  copyCode.textContent = "Kodu kopyala";
  const close = document.createElement("button");
  close.textContent = "Kapat";
  copyCode.onclick = async () => {
    try { await navigator.clipboard.writeText(inviteCode); showToast("Davet kodu kopyalandı"); }
    catch { code.focus(); code.select(); showToast("Ctrl+C ile kopyalayabilirsin."); }
  };
  close.onclick = () => overlay.remove();
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  buttons.append(copyCode, close);
  panel.append(title, description, code, buttons);
  overlay.append(panel);
  document.body.append(overlay);
  code.focus(); code.select();
}

async function copyServerInvite(server) {
  showInviteCodeDialog(server.inviteCode, server.name);
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

async function enterVoiceRoom({ name = accountUser?.username || joinForm.elements.name.value.trim(), room, server, channel, dmConversation }) {
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
    voiceGate?.destroy();
    voiceGate = undefined;
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
  setAvatar(document.querySelector("#account-avatar"), accountUser || { username: name });
  landing.hidden = true;
  roomInWorkspace = Boolean(server) || Boolean(dmConversation);
  if (dmConversation) {
    dmCall = { conversationId: dmConversation, target: activeDirectMessage };
    dashboard.hidden = false;
    chatView.hidden = true;
    topbar.hidden = true;
  } else if (server) {
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
  syncDmCallPanel();
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
  if (!voiceActive) return;
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
  const previousSocket = socket;
  if (previousSocket && previousSocket.readyState !== WebSocket.CLOSED) previousSocket.close();
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
    if (authToken && (currentServer || String(currentRoom || "").startsWith("call-"))) {
      socket.send(JSON.stringify({ type: "presence-auth", token: authToken }));
    }
    publishVoiceState();
    reconnecting = false;
    roomNotice.hidden = true;
  });
  const voiceMessageSocket = socket;
  socket.addEventListener("message", ({ data }) => {
    if (socket !== voiceMessageSocket) return;
    const message = JSON.parse(data);
    if (message.type === "server-members") {
      updateServerMemberPresence(message);
    } else if (message.type === "welcome") {
      clientId = message.clientId;
      for (const peer of message.peers) {
        participantNames.set(peer.id, peer.name);
        participantStates.set(peer.id, participantStates.get(peer.id) || { microphoneMuted: false, soundMuted: false, sharing: false, camera: false });
        createPeerConnection(peer.id, peer.name, false);
      }
      updateParticipantCount();
      playVcCue("join");
    } else if (message.type === "peer-joined") {
      participantNames.set(message.peer.id, message.peer.name);
      participantStates.set(message.peer.id, participantStates.get(message.peer.id) || { microphoneMuted: false, soundMuted: false, sharing: false, camera: false });
      createPeerConnection(message.peer.id, message.peer.name, true);
      // Late joiners do not receive earlier voice-state packets; resend ours (sharing/camera/mute).
      publishVoiceState();
      updateParticipantCount();
      playVcCue("otherJoin");
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
      const leftName = participantNames.get(message.peerId);
      removePeer(message.peerId);
      if (leftName && voiceActive) {
        playVcCue("otherLeave");
        showToast(`${leftName} odadan ayrıldı`);
      }
    }
  });
  const activeSocket = socket;
  socket.addEventListener("close", (event) => {
    if (socket !== activeSocket) return;
    socket = undefined;
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

// Video m-lines are negotiated in a fixed order: screen first, camera second.
function orderedVideoTransceivers(connection) {
  return connection.getTransceivers()
    .filter((transceiver) => transceiver.mid !== null && transceiver.receiver.track.kind === "video")
    .sort((a, b) => Number(a.mid) - Number(b.mid));
}

function remoteVideoKind(connection, transceiver) {
  const index = orderedVideoTransceivers(connection).indexOf(transceiver);
  return index === 0 ? "screen" : index === 1 ? "camera" : undefined;
}

function attachLocalVideoTracks(peer) {
  if (peer.screenTransceiver && screenTrack) peer.screenTransceiver.sender.replaceTrack(screenTrack).catch((error) =>
    console.warn("Ekran paylaşımı katılımcıya aktarılamadı:", error));
  if (peer.cameraTransceiver && cameraTrack) peer.cameraTransceiver.sender.replaceTrack(cameraTrack).catch((error) =>
    console.warn("Kamera katılımcıya aktarılamadı:", error));
}

function createPeerConnection(peerId, name, shouldOffer) {
  if (peers.has(peerId)) return peers.get(peerId).connection;
  const connection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) connection.addTrack(audioTrack, localStream);
  // Only the offering side creates the video m-lines. The answering side adopts the
  // transceivers created by the remote offer (see handleSignal), because browsers do
  // not reliably match pre-created transceivers to the incoming m-lines.
  const screenTransceiver = shouldOffer ? connection.addTransceiver("video", { direction: "sendrecv" }) : undefined;
  const cameraTransceiver = shouldOffer ? connection.addTransceiver("video", { direction: "sendrecv" }) : undefined;
  const peer = {
    connection,
    screenTransceiver,
    cameraTransceiver,
    pendingCandidates: [],
  };
  peers.set(peerId, peer);
  attachLocalVideoTracks(peer);

  connection.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) sendSignal(peerId, { type: "candidate", candidate });
  });
  connection.addEventListener("track", (event) => {
    const { track, streams } = event;
    const stream = streams[0] || new MediaStream([track]);
    if (track.kind === "audio") {
      startSpeakingMonitor(peerId, stream);
      renderParticipant(peerId, name, stream);
      return;
    }
    // The first negotiated video m-line carries the screen share, the second the camera.
    const kind = remoteVideoKind(connection, event.transceiver);
    if (!kind) {
      console.warn("VC: eşleştirilemeyen uzak video track", peerId, event.transceiver?.mid);
      return;
    }
    setParticipantVideoTrack(peerId, kind, track);
    track.addEventListener("unmute", () => {
      if (peers.get(peerId)?.connection === connection) {
        setParticipantVideoTrack(peerId, kind, track);
        refreshVcSharePreview(peerId);
      }
    });
    track.addEventListener("mute", () => {
      if (peers.get(peerId)?.connection === connection)
        renderParticipant(peerId, participantNames.get(peerId) || name, participantStreams.get(peerId));
    });
    track.addEventListener("ended", () => {
      if (peers.get(peerId)?.connection === connection) setParticipantVideoTrack(peerId, kind, undefined);
    }, { once: true });
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
      const [screenTransceiver, cameraTransceiver] = orderedVideoTransceivers(connection);
      for (const transceiver of [screenTransceiver, cameraTransceiver]) {
        if (transceiver) transceiver.direction = "sendrecv";
      }
      peer.screenTransceiver = screenTransceiver;
      peer.cameraTransceiver = cameraTransceiver;
      attachLocalVideoTracks(peer);
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

// Hover previews are available only after the viewer has joined the same voice room.
// No additional stream or media permissions are requested on hover.
let vcSharePreview;
function closeVcSharePreview() {
  if (!vcSharePreview) return;
  vcSharePreview.popup.remove();
  vcSharePreview = undefined;
}
function refreshVcSharePreview(peerId) {
  if (!vcSharePreview || vcSharePreview.peerId !== peerId) return;
  const frame = vcSharePreview.popup.querySelector(".vc-share-preview-frame");
  if (!frame) return;
  const track = participantVideoTracks.get(peerId)?.screen;
  if (!track || track.readyState !== "live" || track.muted) return;
  if (frame.querySelector("video")) return;
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  frame.replaceChildren(video);
  video.play().catch((error) => console.debug("VC yayın önizlemesi bekliyor:", error));
}
function openVcSharePreview(anchor, peerId, name, server, channel) {
  closeVcSharePreview();
  const popup = document.createElement("div");
  popup.className = "vc-share-preview";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `${name} yayın önizlemesi`);
  const heading = document.createElement("strong");
  heading.textContent = `${name} • YAYINDA`;
  const frame = document.createElement("div");
  frame.className = "vc-share-preview-frame";
  const track = participantVideoTracks.get(peerId)?.screen;
  const sameChannel = Boolean(voiceActive && currentServer?.id === server?.id && currentChannel?.id === channel?.id);
  if (sameChannel && track?.readyState === "live" && !track.muted) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    frame.append(video);
    video.play().catch(() => {});
  } else {
    const placeholder = document.createElement("span");
    placeholder.textContent = sameChannel ? "Yayın görüntüsü yükleniyor…" : "Önizleme için ses kanalına katıl";
    frame.append(placeholder);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vc-share-preview-join";
  button.textContent = sameChannel ? "Yayını Gör" : "Katıl";
  button.addEventListener("click", async () => {
    closeVcSharePreview();
    if (!sameChannel) {
      if (server && channel) await joinServerChannel(server, channel);
      return;
    }
    const card = [...grid.querySelectorAll(".participant-card")].find(el => el.dataset.participant === peerId);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("vc-share-preview-highlight");
      window.setTimeout(() => card.classList.remove("vc-share-preview-highlight"), 1600);
    }
  });
  popup.append(heading, frame, button);
  document.body.append(popup);
  const bounds = anchor.getBoundingClientRect();
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right + 10));
  const top = Math.max(8, Math.min(window.innerHeight - height - 8, bounds.top));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  vcSharePreview = { popup, anchor, peerId };
  popup.addEventListener("mouseleave", () => window.setTimeout(() => {
    if (vcSharePreview?.popup === popup && !anchor.matches(":hover") && !popup.matches(":hover")) closeVcSharePreview();
  }, 180));
}
function attachVcSharePreview(badge, peerId, name, server, channel) {
  badge.classList.add("vc-share-preview-trigger");
  badge.tabIndex = 0;
  const show = () => openVcSharePreview(badge, peerId, name, server, channel);
  badge.addEventListener("mouseenter", show);
  badge.addEventListener("focus", show);
  badge.addEventListener("mouseleave", () => window.setTimeout(() => {
    if (vcSharePreview?.anchor === badge && !badge.matches(":hover") && !vcSharePreview.popup.matches(":hover")) closeVcSharePreview();
  }, 240));
  badge.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(); }
    if (event.key === "Escape") closeVcSharePreview();
  });
}
document.addEventListener("pointerdown", event => {
  if (vcSharePreview && !vcSharePreview.popup.contains(event.target) && !vcSharePreview.anchor.contains(event.target)) closeVcSharePreview();
});
document.addEventListener("keydown", event => { if (event.key === "Escape") closeVcSharePreview(); });

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

// ---- Yayın izleme kontrolleri: ses, sinema modu, tam ekran, yayından çık ----
const hiddenStreams = new Set();
const STREAM_ICONS = {
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"></path><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"></path></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9l5 6m0-6-5 6"></path></svg>',
  cinema: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"></rect></svg>',
  cinemaExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"></path></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path></svg>',
  fullscreenExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"></path></svg>',
  leave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"></path></svg>',
};

function setStreamLabel(element, text) {
  element.title = text;
  element.setAttribute("aria-label", text);
}

function streamButton(action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stream-control-button";
  button.dataset.streamAction = action;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

function rerenderParticipant(id) {
  const isSelf = id === "self";
  renderParticipant(id, isSelf ? displayName : (participantNames.get(id) || "Katılımcı"),
    isSelf ? localStream : participantStreams.get(id));
}

function streamFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}

async function toggleStreamFullscreen(card) {
  try {
    if (streamFullscreenElement() === card) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (card.requestFullscreen || card.webkitRequestFullscreen) {
      await (card.requestFullscreen || card.webkitRequestFullscreen).call(card);
    } else {
      showToast("Tarayıcın tam ekranı desteklemiyor.");
    }
  } catch (error) {
    console.warn("Tam ekran değiştirilemedi:", error);
    showToast("Tam ekran başlatılamadı.");
  }
}

function setStreamCinema(card, on) {
  for (const other of grid.querySelectorAll(".participant-card.is-cinema")) {
    if (other !== card) other.classList.remove("is-cinema");
  }
  card.classList.toggle("is-cinema", on);
  document.body.classList.toggle("vc-cinema", on);
  refreshStreamButtons();
}

function refreshStreamButtons() {
  const fullscreenCard = streamFullscreenElement();
  for (const card of grid.querySelectorAll(".participant-card")) {
    const controls = card.querySelector(".stream-controls");
    if (!controls) continue;
    const isFullscreen = fullscreenCard === card;
    const isCinema = card.classList.contains("is-cinema");
    const fullscreenButton = controls.querySelector('[data-stream-action="fullscreen"]');
    fullscreenButton.innerHTML = isFullscreen ? STREAM_ICONS.fullscreenExit : STREAM_ICONS.fullscreen;
    setStreamLabel(fullscreenButton, isFullscreen ? "Tam ekrandan çık" : "Tam ekran");
    fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
    const cinemaButton = controls.querySelector('[data-stream-action="cinema"]');
    cinemaButton.innerHTML = isCinema ? STREAM_ICONS.cinemaExit : STREAM_ICONS.cinema;
    setStreamLabel(cinemaButton, isCinema ? "Sinema modundan çık" : "Sinema modu");
    cinemaButton.setAttribute("aria-pressed", String(isCinema));
  }
}

function updateStreamVolumeUi(controls, level) {
  const slider = controls.querySelector(".stream-volume");
  const muteButton = controls.querySelector('[data-stream-action="mute"]');
  slider.value = String(level);
  slider.style.setProperty("--fill", `${Math.min(100, level / 2)}%`);
  muteButton.innerHTML = level === 0 ? STREAM_ICONS.muted : STREAM_ICONS.volume;
  setStreamLabel(muteButton, level === 0 ? "Yayının sesini aç" : "Yayının sesini kapat");
}

function createStreamControls(card) {
  const controls = document.createElement("div");
  controls.className = "stream-controls";
  controls.hidden = true;
  const volumeGroup = document.createElement("div");
  volumeGroup.className = "stream-volume-group";
  const muteButton = streamButton("mute", "Yayının sesini kapat");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "stream-volume";
  slider.min = "0";
  slider.max = "200";
  slider.step = "5";
  slider.setAttribute("aria-label", "Yayın ses seviyesi");
  volumeGroup.append(muteButton, slider);
  const spacer = document.createElement("span");
  spacer.className = "stream-controls-spacer";
  const cinemaButton = streamButton("cinema", "Sinema modu");
  const fullscreenButton = streamButton("fullscreen", "Tam ekran");
  const leaveButton = streamButton("leave", "Yayından çık");
  leaveButton.classList.add("is-danger");
  leaveButton.innerHTML = STREAM_ICONS.leave;
  controls.append(volumeGroup, spacer, cinemaButton, fullscreenButton, leaveButton);

  const participantId = () => card.dataset.participant;
  slider.addEventListener("input", () => {
    setMemberVolume(participantId(), Number(slider.value));
    updateStreamVolumeUi(controls, Number(slider.value));
  });
  muteButton.addEventListener("click", () => {
    const id = participantId();
    const current = memberVolumes.get(id) ?? getMemberVolume(id);
    if (current > 0) {
      controls.dataset.previousVolume = String(current);
      setMemberVolume(id, 0);
      updateStreamVolumeUi(controls, 0);
    } else {
      const restored = Number(controls.dataset.previousVolume) || 100;
      setMemberVolume(id, restored);
      updateStreamVolumeUi(controls, restored);
    }
  });
  cinemaButton.addEventListener("click", () => setStreamCinema(card, !card.classList.contains("is-cinema")));
  fullscreenButton.addEventListener("click", () => toggleStreamFullscreen(card));
  leaveButton.addEventListener("click", () => {
    const id = participantId();
    if (id === "self") {
      stopScreenShare();
      return;
    }
    hiddenStreams.add(id);
    rerenderParticipant(id);
  });

  // Fare/dokunma hareketinde kontroller birkaç saniye görünür kalır (tam ekran ve sinema modu için).
  let hideTimer;
  const reveal = () => {
    card.classList.add("show-controls");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => card.classList.remove("show-controls"), 2500);
  };
  card.addEventListener("pointermove", reveal);
  card.addEventListener("pointerdown", reveal);
  card.addEventListener("dblclick", (event) => {
    if (event.target.closest(".stream-controls, .participant-name, .stream-watch-button")) return;
    if (card.classList.contains("is-sharing")) toggleStreamFullscreen(card);
  });
  return controls;
}

function syncStreamControls(card, id, { watching, hidden }) {
  let controls = card.querySelector(".stream-controls");
  if (!controls) {
    controls = createStreamControls(card);
    card.append(controls);
  }
  controls.hidden = !watching;
  const isSelf = id === "self";
  controls.querySelector(".stream-volume-group").hidden = isSelf;
  setStreamLabel(controls.querySelector('[data-stream-action="leave"]'), isSelf ? "Paylaşımı bitir" : "Yayından çık");
  if (!isSelf) updateStreamVolumeUi(controls, memberVolumes.get(id) ?? getMemberVolume(id));

  let watchButton = card.querySelector(".stream-watch-button");
  if (hidden && !watchButton) {
    watchButton = document.createElement("button");
    watchButton.type = "button";
    watchButton.className = "stream-watch-button";
    watchButton.textContent = "Yayını izle";
    watchButton.addEventListener("click", () => {
      hiddenStreams.delete(card.dataset.participant);
      rerenderParticipant(card.dataset.participant);
    });
    card.append(watchButton);
  } else if (!hidden && watchButton) {
    watchButton.remove();
  }

  if (!watching) {
    if (card.classList.contains("is-cinema")) setStreamCinema(card, false);
    if (streamFullscreenElement() === card) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
    }
  }
  refreshStreamButtons();
}

document.addEventListener("fullscreenchange", refreshStreamButtons);
document.addEventListener("webkitfullscreenchange", refreshStreamButtons);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || streamFullscreenElement()) return;
  const cinemaCard = grid.querySelector(".participant-card.is-cinema");
  if (cinemaCard) setStreamCinema(cinemaCard, false);
});

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
  const participantAvatar = card.querySelector(".participant-avatar");
  const participantUser = id === "self" ? accountUser :
    (voiceParticipant?.avatar ? voiceParticipant : serverMembers.find((member) => member.id === voiceParticipant?.id)) ||
    (dmCall ? dmCallUserByName(name) : undefined);
  setAvatar(participantAvatar, participantUser || { username: name });
  const nameLabel = card.querySelector(".participant-name");
  const participantName = document.createElement("span");
  participantName.textContent = name;
  const snapshotState = voiceParticipant && { microphoneMuted: voiceParticipant.microphoneMuted === true, soundMuted: voiceParticipant.soundMuted === true, sharing: false, camera: false };
  const indicators = createParticipantIndicators(id === "self" ? getParticipantState(id) : (participantStates.get(id) || snapshotState || getParticipantState(id)));
  nameLabel.replaceChildren(participantName, indicators);
  if (id !== "self" && getParticipantState(id).sharing) {
    const badge = indicators.querySelector(".participant-sharing-badge");
    if (badge) attachVcSharePreview(badge, id, name, currentServer, currentChannel);
  }
  const state = getParticipantState(id);
  const tracks = participantVideoTracks.get(id) || {};
  if (!state.sharing) hiddenStreams.delete(id);
  const screenVideoTrack = state.sharing && !hiddenStreams.has(id) ? tracks.screen : undefined;
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
    if (video._vcTrack !== track) {
      video._vcTrack = track;
      video.srcObject = new MediaStream([track]);
    }
    if (!track.muted) video.play().catch((error) => console.debug("VC uzak video oynatılamadı:", error));
  }

  syncStreamControls(card, id, {
    watching: Boolean(screenVideoTrack),
    hidden: state.sharing && hiddenStreams.has(id),
  });

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
    applyMemberVolumes();
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
    if (id === "self" && voiceGate) {
      // The gate decides what is actually transmitted, so the indicator follows it.
      setParticipantSpeaking(id, voiceGate.open);
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
  // The sidebar tags the local user's entry with the server-assigned clientId, not "self".
  const sidebarId = id === "self" && clientId ? clientId : id;
  document.querySelectorAll(`[data-participant-id="${CSS.escape(sidebarId)}"]`)
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
  hiddenStreams.delete(peerId);
  const removedCard = document.querySelector(`[data-participant="${CSS.escape(peerId)}"]`);
  if (removedCard?.classList.contains("is-cinema")) document.body.classList.remove("vc-cinema");
  removedCard?.remove();
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
    // Masaüstü uygulamasında yerel sistem penceresi yerine uygulama içi seçici kullanılır.
    let includeAudio = true;
    if (window.vcDesktop?.getScreenSources && window.vcDesktop?.selectScreenSource) {
      const result = await pickScreenSource();
      if (!result?.id) return;
      includeAudio = result.includeAudio;
      await window.vcDesktop.selectScreenSource(result.id, includeAudio);
    }
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: selectedVideoConstraints(shareQuality),
      audio: includeAudio,
    });
    screenTrack = screenStream.getVideoTracks()[0];
    screenAudioTrack = screenStream.getAudioTracks()[0];
    if (!screenTrack) {
      screenStream.getTracks().forEach((track) => track.stop());
      return;
    }
    await Promise.all(Array.from(peers.values(), ({ screenTransceiver }) =>
      screenTransceiver?.sender.replaceTrack(screenTrack)));
    // Ekran paylaşımı sesini karşı tarafa gönder
    if (screenAudioTrack) {
      await Promise.all(Array.from(peers.values(), ({ connection }) => {
        const sender = connection.getSenders().find((item) => item.track?.kind === "audio");
        return sender ? sender.replaceTrack(screenAudioTrack) : Promise.resolve();
      }));
    }
    // WGC (Windows Graphics Capture) hatalarında paylaşımı temizle
    screenTrack.addEventListener("ended", stopScreenShare, { once: true });
    screenTrack.addEventListener("error", (e) => {
      console.warn("Ekran paylaşım hatası (WGC):", e.error);
      stopScreenShare();
      showToast("Ekran paylaşımı kesildi (kaynak kapatılmış olabilir).");
    }, { once: true });
    participantVideoTracks.set("self", { ...(participantVideoTracks.get("self") || {}), screen: screenTrack });
    shareButton.classList.add("is-sharing");
    shareLabel.textContent = "Paylaşımı durdur";
    shareButton.setAttribute("aria-label", "Ekran paylaşımını durdur");
    shareButton.title = "Ekran paylaşımını durdur";
    renderParticipant("self", displayName, localStream);
    publishVoiceState();
    playVcCue("share");
  } catch (error) {
    if (error.name !== "NotAllowedError") showToast("Ekran paylaşımı başlatılamadı.");
  }
});

function stopScreenShare() {
  if (!screenTrack) return;
  const track = screenTrack;
  screenTrack = undefined;
  track.stop();
  // Ekran paylaşımı sesini durdur
  if (screenAudioTrack) {
    screenAudioTrack.stop();
    screenAudioTrack = undefined;
  }
  setParticipantVideoTrack("self", "screen", undefined);
  Promise.all(Array.from(peers.values(), ({ screenTransceiver }) => screenTransceiver?.sender.replaceTrack(null)))
    .catch(() => showToast("Ekran paylaşımı durdurulurken bağlantı güncellenemedi."));
  // Mikrofon sesini geri yükle
  if (localStream) {
    const micTrack = localStream.getAudioTracks()[0];
    if (micTrack) {
      Promise.all(Array.from(peers.values(), ({ connection }) => {
        const sender = connection.getSenders().find((item) => item.track?.kind === "audio");
        return sender ? sender.replaceTrack(micTrack) : Promise.resolve();
      })).catch(() => showToast("Mikrofon sesi geri yüklenirken hata oluştu."));
    }
  }
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
      cameraTransceiver?.sender.replaceTrack(null)));
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
      cameraTransceiver?.sender.replaceTrack(cameraTrack)));
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
    showInviteLinkDialog(inviteUrl.href);
  }
});

function leaveRoom() {
  if (voiceActive) playVcCue("leave");
  if (screenTrack) stopScreenShare();
  if (cameraTrack) {
    cameraTrack.stop();
    cameraTrack = undefined;
  }
  const leavingSocket = socket;
  socket = undefined;
  voiceActive = false;
  reconnecting = false;
  leavingSocket?.close(1000, "Odadan ayrıldı");
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
  voiceGate?.destroy();
  voiceGate = undefined;
  voiceAudioContext?.close().catch((error) => console.warn("Ses algılama kaynağı kapatılamadı:", error));
  voiceAudioContext = undefined;
  participantNames.delete("self");
  participantStates.clear();
  participantStreams.clear();
  participantVideoTracks.clear();
  hiddenStreams.clear();
  document.body.classList.remove("vc-cinema");
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  const previousClientId = clientId;
  clientId = undefined;
  currentRoom = undefined;
  if (currentServer && currentChannel && serverVoiceParticipantsServerId === currentServer.id) {
    serverVoiceParticipants = serverVoiceParticipants.filter((p) => p.id !== accountUser?.id && p.clientId !== previousClientId);
  }
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
  dmCall = undefined;
  roomView.classList.remove("is-dm-call");
  dmCallSlot.hidden = true;
  setDmCallLeaveStyle(false);
  renderDmCallBanner();
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

// ---- Uygulama içi uyarı / onay / seçim pencereleri (tarayıcının yerel confirm/prompt yerine) ----
const VC_MODAL_ICONS = {
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path></svg>',
  warning: '<svg viewBox="0 0 24 24"><path d="M12 3.5 2.8 19.5h18.4L12 3.5z"></path><path d="M12 10v4.5M12 17.5h.01"></path></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"></path></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"></path></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"></path></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="12.5" height="12" rx="2.5"></rect><path d="M15.5 10.5 21 7.5v9l-5.5-3"></path></svg>',
  screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg>',
  window: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 9h18"></path></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 20a8 8 0 0 1 16 0"></path></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>',
};

const vcModalQueue = [];
let vcModalActive = false;

function showVcModal(build) {
  return new Promise((resolve) => {
    vcModalQueue.push({ build, resolve });
    runVcModalQueue();
  });
}

function runVcModalQueue() {
  if (vcModalActive) return;
  const item = vcModalQueue.shift();
  if (!item) return;
  vcModalActive = true;
  const dialog = document.createElement("dialog");
  dialog.className = "vc-modal";
  let settled = false;
  let cancelValue = null;
  const api = {
    setCancelValue(value) { cancelValue = value; },
    close(value) {
      if (settled) return;
      settled = true;
      dialog.classList.add("is-closing");
      window.setTimeout(() => {
        dialog.close();
        dialog.remove();
        vcModalActive = false;
        item.resolve(value);
        runVcModalQueue();
      }, 120);
    },
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    api.close(cancelValue);
  });
  dialog.addEventListener("mousedown", (event) => {
    if (event.target === dialog) api.close(cancelValue);
  });
  item.build(dialog, api);
  document.body.append(dialog);
  dialog.showModal();
}

function vcModalCard(dialog, { icon = "info", tone = "info", eyebrow, title, message }) {
  const card = document.createElement("div");
  card.className = `vc-modal-card tone-${tone}`;
  const badge = document.createElement("div");
  badge.className = "vc-modal-icon";
  badge.innerHTML = VC_MODAL_ICONS[icon] || VC_MODAL_ICONS.info;
  const heading = document.createElement("div");
  heading.className = "vc-modal-heading";
  if (eyebrow) {
    const label = document.createElement("p");
    label.className = "vc-modal-eyebrow";
    label.textContent = eyebrow;
    heading.append(label);
  }
  const titleElement = document.createElement("h2");
  titleElement.className = "vc-modal-title";
  titleElement.textContent = title;
  heading.append(titleElement);
  if (message) {
    const text = document.createElement("p");
    text.className = "vc-modal-message";
    text.textContent = message;
    heading.append(text);
  }
  const header = document.createElement("div");
  header.className = "vc-modal-header";
  header.append(badge, heading);
  const body = document.createElement("div");
  body.className = "vc-modal-body";
  const actions = document.createElement("div");
  actions.className = "vc-modal-actions";
  card.append(header, body, actions);
  dialog.append(card);
  return { card, body, actions };
}

function vcModalButton(label, kind, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `vc-modal-button is-${kind}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// confirm yerine: Promise<boolean>
function vcConfirm(message, options = {}) {
  const tone = options.tone || "warning";
  return showVcModal((dialog, api) => {
    api.setCancelValue(false);
    const { actions } = vcModalCard(dialog, {
      icon: options.icon || (tone === "danger" ? "trash" : tone === "success" ? "phone" : "warning"),
      tone,
      eyebrow: options.eyebrow,
      title: options.title || "Emin misin?",
      message,
    });
    const cancel = vcModalButton(options.cancelText || "Vazgeç", "secondary", () => api.close(false));
    const confirm = vcModalButton(options.confirmText || "Onayla", tone === "danger" ? "danger" : "primary", () => api.close(true));
    actions.append(cancel, confirm);
    // Tehlikeli işlemlerde odak yanlışlıkla Enter ile onaylanmasın diye "Vazgeç"te başlar.
    (tone === "danger" ? cancel : confirm).focus();
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && document.activeElement === dialog) api.close(tone !== "danger");
    });
  });
}

// prompt yerine: Promise<string | null>
function vcPrompt(message, options = {}) {
  return showVcModal((dialog, api) => {
    api.setCancelValue(null);
    const { body, actions } = vcModalCard(dialog, {
      icon: options.icon || "edit",
      tone: "info",
      eyebrow: options.eyebrow,
      title: options.title || "Değer gir",
      message,
    });
    const field = document.createElement(options.multiline ? "textarea" : "input");
    field.className = "vc-modal-input";
    if (!options.multiline) field.type = "text";
    else field.rows = 3;
    field.value = options.value || "";
    if (options.placeholder) field.placeholder = options.placeholder;
    if (options.maxLength) field.maxLength = options.maxLength;
    body.append(field);
    const submit = () => api.close(field.value);
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (!options.multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submit();
      }
    });
    actions.append(
      vcModalButton("Vazgeç", "secondary", () => api.close(null)),
      vcModalButton(options.confirmText || "Kaydet", "primary", submit),
    );
    window.setTimeout(() => { field.focus(); field.select(); }, 30);
  });
}

// ---- Hata bildir ----
function bugReportPageLabel() {
  if (!dmView.hidden) return "Özel mesaj";
  if (!chatView.hidden) return "Sunucu sohbeti";
  if (voiceActive) return "Sesli oda";
  if (!friendsView.hidden) return "Arkadaşlar";
  return "Sunucu paneli";
}

function openBugReport() {
  if (!accountUser || !authToken) {
    showToast("Hata bildirmek için hesabınla giriş yapmalısın.");
    return;
  }
  const page = bugReportPageLabel();
  return showVcModal((dialog, api) => {
    api.setCancelValue(null);
    const { body, actions } = vcModalCard(dialog, {
      icon: "warning",
      tone: "info",
      eyebrow: "GERİ BİLDİRİM",
      title: "Hata bildir",
      message: "Karşılaştığın sorunu ya da şikâyetini yaz. Ekibimiz inceleyecek.",
    });
    const field = document.createElement("textarea");
    field.className = "vc-modal-input";
    field.rows = 6;
    field.maxLength = 1000;
    field.placeholder = "Ne oldu? Mümkünse hangi adımlarda ortaya çıktığını da yaz.";
    field.setAttribute("aria-label", "Hata açıklaması");
    const counter = document.createElement("p");
    counter.className = "bug-report-counter";
    const error = document.createElement("p");
    error.className = "bug-report-error";
    error.hidden = true;
    body.append(field, counter, error);
    const send = vcModalButton("Gönder", "primary", async () => {
      const text = field.value.trim();
      if (text.length < 10) {
        error.textContent = "Lütfen en az 10 karakterlik bir açıklama yaz.";
        error.hidden = false;
        field.focus();
        return;
      }
      send.disabled = true;
      error.hidden = true;
      try {
        await apiRequest("/api/bug-reports", { method: "POST", body: { reason: text, page } });
      } catch (requestError) {
        error.textContent = requestError.message || "Gönderilemedi. Tekrar dene.";
        error.hidden = false;
        send.disabled = false;
        return;
      }
      dialog.replaceChildren();
      const thanks = vcModalCard(dialog, {
        icon: "check",
        tone: "success",
        eyebrow: "TEŞEKKÜRLER",
        title: "Bildirimin için teşekkürler!",
        message: "Geri bildirimin bize ulaştı. İnceleyip gerekli düzeltmeleri yapacağız.",
      });
      const close = vcModalButton("Kapat", "primary", () => api.close(true));
      thanks.actions.append(close);
      close.focus();
    });
    const updateCounter = () => { counter.textContent = `${field.value.length}/1000`; };
    field.addEventListener("input", updateCounter);
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        send.click();
      }
    });
    updateCounter();
    actions.append(vcModalButton("Vazgeç", "secondary", () => api.close(null)), send);
    window.setTimeout(() => field.focus(), 30);
  });
}
document.querySelector("#bug-report-button")?.addEventListener("click", openBugReport);

// Masaüstü uygulaması köprüsü (window.vcDesktop) varsa kullanılan ekran/pencere seçici.
// Promise<{ id: string, includeAudio: boolean } | null> — seçilen kaynağın kimliği ve ses tercihi ya da iptal.
function pickScreenSource() {
  return showVcModal((dialog, api) => {
    api.setCancelValue(null);
    dialog.classList.add("is-wide");
    const { body, actions } = vcModalCard(dialog, {
      icon: "screen",
      tone: "info",
      eyebrow: "EKRAN PAYLAŞIMI",
      title: "Ne paylaşmak istersin?",
      message: "Paylaşmak istediğin ekranı veya pencereyi seç.",
    });
    const tabs = document.createElement("div");
    tabs.className = "vc-source-tabs";
    tabs.setAttribute("role", "tablist");
    const list = document.createElement("div");
    list.className = "vc-source-grid";
    body.append(tabs, list);
    let sources = [];
    let activeTab = "screen";
    let selectedId = null;
    let includeAudio = false;

    // Masaüstü uygulamasında ses paylaşım seçeneği göster
    const isDesktop = !!(window.vcDesktop?.getScreenSources && window.vcDesktop?.selectScreenSource);
    let audioLabel;
    if (isDesktop) {
      audioLabel = document.createElement("label");
      audioLabel.className = "vc-source-audio-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = false;
      checkbox.addEventListener("change", (e) => { includeAudio = e.target.checked; });
      const checkboxText = document.createElement("span");
      checkboxText.textContent = "Sistem sesini de paylaş";
      audioLabel.append(checkbox, checkboxText);
      body.append(audioLabel);
    }

    const shareButton = vcModalButton("Paylaş", "primary", () => api.close({ id: selectedId, includeAudio }));
    shareButton.disabled = true;
    const refreshButton = vcModalButton("", "ghost", () => load());
    refreshButton.innerHTML = `${VC_MODAL_ICONS.refresh}<span>Yenile</span>`;
    const spacer = document.createElement("span");
    spacer.className = "vc-modal-spacer";
    actions.append(refreshButton, spacer, vcModalButton("Vazgeç", "secondary", () => api.close(null)), shareButton);

    const renderTabs = () => {
      tabs.replaceChildren();
      for (const [type, label, icon] of [["screen", "Ekranlar", "screen"], ["window", "Pencereler", "window"]]) {
        const count = sources.filter((source) => source.type === type).length;
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "vc-source-tab";
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(activeTab === type));
        tab.classList.toggle("is-active", activeTab === type);
        tab.innerHTML = `${VC_MODAL_ICONS[icon]}<span></span><em></em>`;
        tab.querySelector("span").textContent = label;
        tab.querySelector("em").textContent = String(count);
        tab.addEventListener("click", () => { activeTab = type; render(); });
        tabs.append(tab);
      }
    };

    const setMessage = (text, loading = false) => {
      const note = document.createElement("p");
      note.className = "vc-source-empty";
      note.textContent = text;
      note.classList.toggle("is-loading", loading);
      list.replaceChildren(note);
    };

    const render = () => {
      renderTabs();
      const visible = sources.filter((source) => source.type === activeTab);
      if (!visible.length) {
        setMessage(activeTab === "screen" ? "Paylaşılabilir ekran bulunamadı." : "Paylaşılabilir pencere bulunamadı.");
        return;
      }
      list.replaceChildren();
      for (const source of visible) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "vc-source";
        item.setAttribute("aria-pressed", String(source.id === selectedId));
        item.classList.toggle("is-selected", source.id === selectedId);
        const preview = document.createElement("div");
        preview.className = "vc-source-preview";
        if (source.thumbnail) {
          const image = document.createElement("img");
          image.alt = "";
          image.src = source.thumbnail;
          preview.append(image);
        }
        const check = document.createElement("span");
        check.className = "vc-source-check";
        check.innerHTML = VC_MODAL_ICONS.check;
        preview.append(check);
        const label = document.createElement("div");
        label.className = "vc-source-label";
        if (source.appIcon) {
          const icon = document.createElement("img");
          icon.alt = "";
          icon.src = source.appIcon;
          label.append(icon);
        }
        const name = document.createElement("span");
        name.textContent = source.name;
        name.title = source.name;
        label.append(name);
        item.append(preview, label);
        item.addEventListener("click", () => {
          selectedId = source.id;
          shareButton.disabled = false;
          render();
        });
        item.addEventListener("dblclick", () => api.close(source.id));
        list.append(item);
      }
    };

    async function load() {
      setMessage("Ekranlar ve pencereler alınıyor…", true);
      refreshButton.disabled = true;
      try {
        const result = await window.vcDesktop.getScreenSources();
        sources = (Array.isArray(result) ? result : []).filter((source) => source && typeof source.id === "string");
        if (!sources.some((source) => source.type === activeTab) && sources.length) {
          activeTab = sources[0].type === "window" ? "window" : "screen";
        }
        if (selectedId && !sources.some((source) => source.id === selectedId)) {
          selectedId = null;
          shareButton.disabled = true;
        }
        render();
      } catch (error) {
        console.warn("Ekran kaynakları alınamadı:", error);
        sources = [];
        renderTabs();
        setMessage("Ekranlar ve pencereler alınamadı. Yenilemeyi dene.");
      } finally {
        refreshButton.disabled = false;
      }
    }
    renderTabs();
    load();
  });
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

// VC CONTROL 4.0: announcements are fetched from the public read-only endpoint.
// No admin key is ever sent to the browser. Text is inserted using textContent.
(() => {
  const widget = document.querySelector("#vc-announcement-widget");
  const preview = document.querySelector("#vc-announcement-preview");
  const previewText = document.querySelector("#vc-announcement-preview-text");
  const badge = document.querySelector("#vc-announcement-count");
  const dialog = document.querySelector("#vc-announcement-dialog");
  const list = document.querySelector("#vc-announcement-list");
  if (!widget || !dialog || !list) return;
  let current = [];
  let lastAccountId = null;
  let dismissed = new Set();
  const storageKey = (id) => `vc.announcements.dismissed.${id}`;
  function readDismissed(id) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(id)) || "[]");
      return new Set(Array.isArray(saved) ? saved.filter((x) => typeof x === "string").slice(-200) : []);
    } catch { return new Set(); }
  }
  function saveDismissed() {
    if (!lastAccountId) return;
    try { localStorage.setItem(storageKey(lastAccountId), JSON.stringify([...dismissed].slice(-200))); } catch {}
  }
  function render() {
    widget.hidden = !accountUser;
    if (!accountUser) { preview.hidden = true; if (dialog.open) dialog.close(); return; }
    const unread = current.filter((item) => !dismissed.has(item.id));
    badge.hidden = !unread.length;
    badge.textContent = unread.length > 99 ? "99+" : String(unread.length);
    const newest = unread[0];
    preview.hidden = !newest || dialog.open;
    if (newest) previewText.textContent = newest.message;
    list.replaceChildren();
    if (!current.length) {
      const empty = document.createElement("p"); empty.textContent = "Şu anda aktif duyuru bulunmuyor."; list.append(empty);
    }
    for (const item of current) {
      const article = document.createElement("article"); article.className = "vc-announcement-item";
      const time = document.createElement("time");
      const date = new Date(item.at);
      time.textContent = Number.isNaN(date.getTime()) ? "VC Yönetimi" : `VC Yönetimi · ${date.toLocaleString("tr-TR")}`;
      const body = document.createElement("p"); body.textContent = item.message;
      article.append(time, body); list.append(article);
    }
  }
  async function refresh() {
    if (!accountUser) { lastAccountId = null; current = []; render(); return; }
    if (lastAccountId !== accountUser.id) {
      lastAccountId = accountUser.id;
      dismissed = readDismissed(lastAccountId);
      current = [];
    }
    try {
      const response = await fetch("/api/announcements", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data.announcements)) return;
      current = data.announcements.filter((item) => typeof item.id === "string" && typeof item.message === "string");
      render();
    } catch { /* Connection interruption: retry on the next poll. */ }
  }
  function markRead() {
    for (const item of current) dismissed.add(item.id);
    saveDismissed();
    preview.hidden = true;
    render();
  }
  // Drag with mouse or touch. Save position locally; tap still opens the dialog.
  const trigger = document.querySelector("#vc-announcement-open");
  const positionKey = "vc.announcement.widget.position.v1";
  let suppressClick = false;
  function place(x, y) {
    const w = widget.offsetWidth || 46, h = widget.offsetHeight || 46;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    const top = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    widget.style.left = `${left}px`; widget.style.top = `${top}px`;
    widget.style.right = "auto"; widget.style.bottom = "auto";
    return { x: left, y: top };
  }
  try { const saved = JSON.parse(localStorage.getItem(positionKey) || "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) place(saved.x, saved.y);
  } catch {}
  let drag = null;
  trigger.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = widget.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY, moved: false };
    trigger.setPointerCapture(e.pointerId);
  });
  trigger.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
    drag.moved = true; widget.classList.add("vc-announcement-dragging");
    place(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      const rect = widget.getBoundingClientRect();
      try { localStorage.setItem(positionKey, JSON.stringify({ x: rect.left, y: rect.top })); } catch {}
      suppressClick = true;
    }
    widget.classList.remove("vc-announcement-dragging"); drag = null;
  }
  trigger.addEventListener("pointerup", endDrag);
  trigger.addEventListener("pointercancel", endDrag);
  trigger.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener("resize", () => {
    if (!widget.style.left) return;
    const rect = widget.getBoundingClientRect();
    const pos = place(rect.left, rect.top);
    try { localStorage.setItem(positionKey, JSON.stringify(pos)); } catch {}
  });
  document.querySelector("#vc-announcement-open").addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    markRead();
  });
  document.querySelector("#vc-announcement-preview-open").addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    markRead();
  });
  document.querySelector("#vc-announcement-dismiss").addEventListener("click", () => {
    const first = current.find((item) => !dismissed.has(item.id));
    if (first) { dismissed.add(first.id); saveDismissed(); }
    render();
  });
  document.querySelector("#vc-announcement-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  refresh();
  window.setInterval(() => { if (!document.hidden) refresh(); }, 12000);
})();
