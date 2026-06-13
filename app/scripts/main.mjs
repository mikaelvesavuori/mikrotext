import { apiRequest } from "./api.mjs";
import { CONFIG, loadRuntimeConfig } from "./config.mjs";
import {
  createRatchetState,
  decryptEnvelope,
  encryptTextMessage,
  generateSigningKeys,
  generateRoomKey,
  generateToken,
  importRoomKey,
  importSigningPrivateKey,
  participantFingerprint,
  roomSafetyCode
} from "./crypto.mjs";
import { randomName } from "./names.mjs";
import { getCurrentRoom, state } from "./state.mjs";
import { getStoredTheme, loadStoredRooms, saveStoredRooms, setStoredTheme } from "./storage.mjs";

const dom = {
  body: document.body,
  createRoomBtn: document.getElementById("create-room-btn"),
  emptyCreateRoomBtn: document.getElementById("empty-create-room-btn"),
  roomsList: document.getElementById("rooms-list"),
  roomTitle: document.getElementById("room-title"),
  roomSubtitle: document.getElementById("room-subtitle"),
  copyInviteBtn: document.getElementById("copy-invite-btn"),
  mobileCopyInviteBtn: document.getElementById("mobile-copy-invite-btn"),
  safetyCodeBtn: document.getElementById("safety-code-btn"),
  mobileSafetyCodeBtn: document.getElementById("mobile-safety-code-btn"),
  burnRoomBtn: document.getElementById("burn-room-btn"),
  mobileBurnRoomBtn: document.getElementById("mobile-burn-room-btn"),
  emptyState: document.getElementById("empty-state"),
  joinPanel: document.getElementById("join-panel"),
  chatPanel: document.getElementById("chat-panel"),
  joinName: document.getElementById("join-name"),
  regenerateNameBtn: document.getElementById("regenerate-name-btn"),
  joinRoomBtn: document.getElementById("join-room-btn"),
  expiresStatus: document.getElementById("expires-status"),
  participantStatus: document.getElementById("participant-status"),
  messages: document.getElementById("messages"),
  composerForm: document.getElementById("composer-form"),
  messageInput: document.getElementById("message-input"),
  sendMessageBtn: document.getElementById("send-message-btn"),
  themeToggle: document.getElementById("theme-toggle"),
  mobileThemeToggle: document.getElementById("mobile-theme-toggle"),
  mobileMenuToggle: document.getElementById("mobile-menu-toggle"),
  mobileMenuClose: document.getElementById("mobile-menu-close"),
  toast: document.getElementById("toast")
};

initialize();

async function initialize() {
  await loadRuntimeConfig();
  applyTheme();
  bindEvents();
  await restoreRooms();

  const invite = parseInviteFromUrl();
  if (invite && !state.rooms.has(invite.roomId)) {
    state.pendingInvite = invite;
    dom.joinName.value = randomName();
    renderJoin();
    return;
  }

  if (state.rooms.size > 0) {
    selectRoom([...state.rooms.keys()][0]);
    return;
  }

  renderEmpty();
}

function bindEvents() {
  dom.createRoomBtn.addEventListener("click", createRoom);
  dom.emptyCreateRoomBtn.addEventListener("click", createRoom);
  dom.copyInviteBtn.addEventListener("click", copyInvite);
  dom.mobileCopyInviteBtn.addEventListener("click", copyInvite);
  dom.safetyCodeBtn.addEventListener("click", copySafetyDetails);
  dom.mobileSafetyCodeBtn.addEventListener("click", copySafetyDetails);
  dom.burnRoomBtn.addEventListener("click", burnCurrentRoom);
  dom.mobileBurnRoomBtn.addEventListener("click", burnCurrentRoom);
  dom.regenerateNameBtn.addEventListener("click", () => {
    dom.joinName.value = randomName();
  });
  dom.joinRoomBtn.addEventListener("click", joinPendingRoom);
  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.mobileThemeToggle.addEventListener("click", toggleTheme);
  dom.mobileMenuToggle.addEventListener("click", openMobileMenu);
  dom.mobileMenuClose.addEventListener("click", closeMobileMenu);
  dom.composerForm.addEventListener("submit", sendMessage);
  dom.messageInput.addEventListener("input", resizeComposer);
  dom.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      dom.composerForm.requestSubmit();
    }
  });
}

async function restoreRooms() {
  for (const storedRoom of loadStoredRooms()) {
    try {
      if (!storedRoom.signingPrivateKey || !storedRoom.signingPublicKey) continue;

      const cryptoKey = await importRoomKey(storedRoom.keyString);
      const signingPrivateCryptoKey = await importSigningPrivateKey(storedRoom.signingPrivateKey);
      const participants = await addParticipantFingerprints(storedRoom.participants || []);
      state.rooms.set(storedRoom.roomId, {
        ...storedRoom,
        participants,
        cryptoKey,
        signingPrivateCryptoKey,
        safetyCode: await roomSafetyCode(storedRoom.keyString, participants),
        messages: [],
        messageIds: new Set(),
        lastMessageId: null,
        ...createMissingRatchetState(storedRoom)
      });
    } catch (error) {
      if (CONFIG.debugMode) console.error("Failed to restore room:", error);
    }
  }
}

async function createRoom() {
  setCreateRoomBusy(true);

  try {
    const keyString = generateRoomKey();
    const cryptoKey = await importRoomKey(keyString);
    const signingKeys = await generateSigningKeys();
    const participantName = randomName();
    const session = await apiRequest("/rooms", {
      method: "POST",
      body: {
        participantName,
        ttlMs: CONFIG.defaultTtlMs,
        signingPublicKey: signingKeys.signingPublicKey
      }
    });
    const participants = await addParticipantFingerprints(session.participants);
    const room = {
      ...session,
      participants,
      keyString,
      cryptoKey,
      ...signingKeys,
      ...createRatchetState(),
      safetyCode: await roomSafetyCode(keyString, participants),
      participantName,
      messages: [],
      messageIds: new Set(),
      lastMessageId: null
    };

    state.rooms.set(room.roomId, room);
    saveStoredRooms(state.rooms);
    selectRoom(room.roomId);
    closeMobileMenu();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setCreateRoomBusy(false);
  }
}

async function joinPendingRoom() {
  if (!state.pendingInvite) return;

  setBusy(dom.joinRoomBtn, true);

  try {
    const participantName = dom.joinName.value.trim() || randomName();
    const cryptoKey = await importRoomKey(state.pendingInvite.keyString);
    const signingKeys = await generateSigningKeys();
    const session = await apiRequest(`/rooms/${encodeURIComponent(state.pendingInvite.roomId)}/join`, {
      method: "POST",
      body: {
        participantName,
        inviteToken: state.pendingInvite.inviteToken,
        signingPublicKey: signingKeys.signingPublicKey
      }
    });
    const participants = await addParticipantFingerprints(session.participants);
    const room = {
      ...session,
      participants,
      keyString: state.pendingInvite.keyString,
      cryptoKey,
      ...signingKeys,
      ...createRatchetState(),
      safetyCode: await roomSafetyCode(state.pendingInvite.keyString, participants),
      participantName,
      messages: [],
      messageIds: new Set(),
      lastMessageId: null
    };

    state.rooms.set(room.roomId, room);
    state.pendingInvite = null;
    saveStoredRooms(state.rooms);
    clearInviteUrl();
    selectRoom(room.roomId);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(dom.joinRoomBtn, false);
  }
}

async function copyInvite() {
  const room = getCurrentRoom();
  if (!room) return;

  setActionBusy([dom.copyInviteBtn, dom.mobileCopyInviteBtn], true);

  try {
    const inviteToken = generateToken();
    await apiRequest(`/rooms/${encodeURIComponent(room.roomId)}/invites`, {
      method: "POST",
      token: room.sessionToken,
      body: { inviteToken }
    });

    const url = new URL(window.location.origin);
    url.pathname = `/r/${encodeURIComponent(room.roomId)}`;
    url.searchParams.set("invite", inviteToken);
    url.hash = room.keyString;

    await copyText(url.toString());
    showToast("Invite copied");
    closeMobileMenu();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setActionBusy([dom.copyInviteBtn, dom.mobileCopyInviteBtn], false);
  }
}

async function burnCurrentRoom() {
  const room = getCurrentRoom();
  if (!room) return;
  if (!window.confirm("Burn this room now?")) return;

  try {
    await apiRequest(`/rooms/${encodeURIComponent(room.roomId)}/burn`, {
      method: "POST",
      token: room.sessionToken
    });
  } catch (error) {
    if (CONFIG.debugMode) console.error("Burn failed:", error);
  }

  removeRoom(room.roomId);
  closeMobileMenu();
  showToast("Room burned");
}

async function sendMessage(event) {
  event.preventDefault();

  const room = getCurrentRoom();
  const text = dom.messageInput.value.trim();
  if (!room || !text) return;
  if (text.length > CONFIG.maxMessageLength) {
    showToast("Message too long", "error");
    return;
  }

  setBusy(dom.sendMessageBtn, true);

  try {
    const encrypted = await encryptTextMessage(room, text);
    const response = await apiRequest(`/rooms/${encodeURIComponent(room.roomId)}/messages`, {
      method: "POST",
      token: room.sessionToken,
      body: encrypted
    });

    dom.messageInput.value = "";
    resizeComposer();
    await addEnvelope(room, response.message);
    saveStoredRooms(state.rooms);
    render();
    scrollMessagesToEnd();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(dom.sendMessageBtn, false);
  }
}

function selectRoom(roomId) {
  state.currentRoomId = roomId;
  closeMobileMenu();
  render();
  syncRoom(getCurrentRoom(), false);
  restartPolling();
  window.setTimeout(() => dom.messageInput.focus(), 50);
}

async function syncRoom(room, quiet = true) {
  if (!room) return;

  const endpoint = room.lastMessageId
    ? `/rooms/${encodeURIComponent(room.roomId)}/state?after=${encodeURIComponent(room.lastMessageId)}`
    : `/rooms/${encodeURIComponent(room.roomId)}/state`;

  try {
    const roomState = await apiRequest(endpoint, {
      token: room.sessionToken
    });

    room.expiresAt = roomState.expiresAt;
    room.participants = await addParticipantFingerprints(roomState.participants);
    room.safetyCode = await roomSafetyCode(room.keyString, room.participants);

    for (const envelope of roomState.messages) {
      await addEnvelope(room, envelope);
    }

    saveStoredRooms(state.rooms);
    if (state.currentRoomId === room.roomId) render();
  } catch (error) {
    if (!quiet) showToast(error.message, "error");

    if (/Room not found|Room expired|Unauthorized/.test(error.message)) {
      removeRoom(room.roomId);
    }
  }
}

async function addEnvelope(room, envelope) {
  if (room.messageIds.has(envelope.id)) return;

  let payload;
  try {
    payload = await decryptEnvelope(room, envelope);
  } catch (error) {
      if (CONFIG.debugMode) console.error("Failed to verify or decrypt message:", error);
    payload = {
      text: "Unable to verify message",
      sentAt: envelope.createdAt,
      failed: true
    };
  }

  room.messageIds.add(envelope.id);
  room.lastMessageId = envelope.id;
  room.messages.push({
    ...envelope,
    payload
  });
}

function removeRoom(roomId) {
  state.rooms.delete(roomId);
  if (state.currentRoomId === roomId) state.currentRoomId = null;
  saveStoredRooms(state.rooms);

  const nextRoomId = [...state.rooms.keys()][0];
  if (nextRoomId) {
    selectRoom(nextRoomId);
    return;
  }

  stopPolling();
  renderEmpty();
}

function render() {
  const room = getCurrentRoom();
  renderRoomList();

  if (!room) {
    renderEmpty();
    return;
  }

  setScreenMode("room");
  dom.emptyState.hidden = true;
  dom.joinPanel.hidden = true;
  dom.chatPanel.hidden = false;
  setRoomActionDisabled(false);
  dom.roomTitle.textContent = room.participantName;
  dom.roomSubtitle.textContent = shortRoom(room.roomId);
  dom.expiresStatus.textContent = formatRemaining(room.expiresAt);
  dom.participantStatus.textContent = formatParticipants(room.participants?.length || 1);
  renderMessages(room);
}

function renderEmpty() {
  state.currentRoomId = null;
  renderRoomList();
  setScreenMode("empty");
  dom.emptyState.hidden = false;
  dom.joinPanel.hidden = true;
  dom.chatPanel.hidden = true;
  setRoomActionDisabled(true);
  dom.roomTitle.textContent = "MikroText";
  dom.roomSubtitle.textContent = "";
}

function renderJoin() {
  stopPolling();
  renderRoomList();
  setScreenMode("join");
  dom.emptyState.hidden = true;
  dom.joinPanel.hidden = false;
  dom.chatPanel.hidden = true;
  setRoomActionDisabled(true);
  dom.roomTitle.textContent = "Invite";
  dom.roomSubtitle.textContent = state.pendingInvite ? shortRoom(state.pendingInvite.roomId) : "";
  window.setTimeout(() => dom.joinName.focus(), 50);
}

function renderRoomList() {
  dom.roomsList.replaceChildren();

  for (const room of state.rooms.values()) {
    const row = document.createElement("button");
    row.className = room.roomId === state.currentRoomId ? "room-row active" : "room-row";
    row.addEventListener("click", () => selectRoom(room.roomId));

    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "room-row-title";
    title.textContent = room.participantName;

    const meta = document.createElement("div");
    meta.className = "room-row-meta";
    meta.textContent = formatRemaining(room.expiresAt);

    text.append(title, meta);
    row.append(text);
    dom.roomsList.append(row);
  }
}

function renderMessages(room) {
  dom.messages.replaceChildren();

  if (room.messages.length === 0) return;

  for (const message of room.messages) {
    const isOwn = message.senderId === room.participantId;
    const sender = findParticipant(room, message.senderId);
    const row = document.createElement("div");
    row.className = isOwn ? "message-row own" : "message-row";

    const bubble = document.createElement("div");
    bubble.className = message.payload.failed ? "message-bubble failed" : "message-bubble";

    const author = document.createElement("div");
    author.className = "message-author";
    author.textContent = sender?.name || "Unknown";
    if (sender?.fingerprint) author.title = sender.fingerprint;

    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.payload.text || "";

    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = formatTime(message.payload.sentAt || message.createdAt);

    bubble.append(author, text, time);
    row.append(bubble);
    dom.messages.append(row);
  }
}

async function addParticipantFingerprints(participants) {
  return Promise.all(
    participants.map(async (participant) => ({
      ...participant,
      fingerprint: participant.signingPublicKey
        ? await participantFingerprint(participant.signingPublicKey)
        : null
    }))
  );
}

function createMissingRatchetState(room) {
  const ratchetState = createRatchetState();

  return {
    sendChainId: room.sendChainId || ratchetState.sendChainId,
    sendChainKey: room.sendChainKey || ratchetState.sendChainKey,
    sendMessageIndex: Number.isInteger(room.sendMessageIndex) ? room.sendMessageIndex : 0
  };
}

async function copySafetyDetails() {
  const room = getCurrentRoom();
  if (!room) return;

  const details = [
    "MikroText Safety code",
    room.safetyCode,
    "",
    "Participants",
    ...(room.participants || []).map(
      (participant) => `${participant.name}: ${participant.fingerprint || "unknown"}`
    )
  ].join("\n");

  await copyText(details);
  showToast("Safety code copied");
  closeMobileMenu();
}

function findParticipant(room, participantId) {
  return room.participants?.find((participant) => participant.id === participantId) || null;
}

function restartPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(() => {
    syncRoom(getCurrentRoom(), true);
  }, CONFIG.pollIntervalMs);
}

function stopPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function parseInviteFromUrl() {
  const url = new URL(window.location.href);
  const pathMatch = url.pathname.match(/\/r\/([^/]+)/);
  const roomId = pathMatch?.[1] || url.searchParams.get("room");
  const inviteToken = url.searchParams.get("invite");
  const keyString = url.hash ? url.hash.slice(1) : "";

  if (!roomId || !inviteToken || !keyString) return null;

  return {
    roomId: decodeURIComponent(roomId),
    inviteToken,
    keyString
  };
}

function clearInviteUrl() {
  window.history.replaceState({}, "", "/");
}

function applyTheme() {
  const theme = getStoredTheme();
  dom.body.classList.toggle("light-mode", theme === "light");
}

function toggleTheme() {
  const isLight = dom.body.classList.toggle("light-mode");
  setStoredTheme(isLight ? "light" : "dark");
}

function openMobileMenu() {
  dom.body.classList.add("mobile-menu-open");
}

function closeMobileMenu() {
  dom.body.classList.remove("mobile-menu-open");
}

function setScreenMode(mode) {
  dom.body.classList.toggle("is-empty", mode === "empty");
  dom.body.classList.toggle("is-joining", mode === "join");
  dom.body.classList.toggle("has-room", mode === "room");
}

function resizeComposer() {
  dom.messageInput.style.height = "auto";
  dom.messageInput.style.height = `${Math.min(dom.messageInput.scrollHeight, 128)}px`;
}

function setBusy(element, isBusy) {
  element.disabled = isBusy;
}

function setActionBusy(elements, isBusy) {
  for (const element of elements) {
    element.disabled = isBusy;
  }
}

function setCreateRoomBusy(isBusy) {
  setActionBusy([dom.createRoomBtn, dom.emptyCreateRoomBtn], isBusy);
}

function setRoomActionDisabled(isDisabled) {
  dom.copyInviteBtn.disabled = isDisabled;
  dom.mobileCopyInviteBtn.disabled = isDisabled;
  dom.safetyCodeBtn.disabled = isDisabled;
  dom.mobileSafetyCodeBtn.disabled = isDisabled;
  dom.burnRoomBtn.disabled = isDisabled;
  dom.mobileBurnRoomBtn.disabled = isDisabled;
}

function scrollMessagesToEnd() {
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function showToast(message, type = "info") {
  if (state.toastTimer) window.clearTimeout(state.toastTimer);

  dom.toast.textContent = message;
  dom.toast.className = type === "error" ? "toast visible error" : "toast visible";
  state.toastTimer = window.setTimeout(() => {
    dom.toast.className = "toast";
  }, 2600);
}

function shortRoom(roomId) {
  return `#${roomId.slice(0, 6)}`;
}

function formatParticipants(count) {
  return count <= 1 ? "Only you" : `${count} people`;
}

function formatRemaining(expiresAt) {
  const remainingMs = Date.parse(expiresAt) - Date.now();
  if (remainingMs <= 0) return "Expired";

  const minutes = Math.ceil(remainingMs / 60000);
  if (minutes < 60) return `${minutes}m left`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m left` : `${hours}h left`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
