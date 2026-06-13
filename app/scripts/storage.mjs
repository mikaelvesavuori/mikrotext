const ROOMS_KEY = "mikrotext.rooms.v1";
const THEME_KEY = "mikrotext.theme";

export function loadStoredRooms() {
  try {
    const raw = sessionStorage.getItem(ROOMS_KEY);
    if (!raw) return [];

    const rooms = JSON.parse(raw);
    const now = Date.now();

    return Array.isArray(rooms)
      ? rooms.filter((room) => room.expiresAt && Date.parse(room.expiresAt) > now)
      : [];
  } catch (_error) {
    return [];
  }
}

export function saveStoredRooms(rooms) {
  const serializable = [...rooms.values()].map((room) => ({
    roomId: room.roomId,
    keyString: room.keyString,
    sessionToken: room.sessionToken,
    participantId: room.participantId,
    participantName: room.participantName,
    signingPublicKey: room.signingPublicKey,
    signingPrivateKey: room.signingPrivateKey,
    sendChainId: room.sendChainId,
    sendChainKey: room.sendChainKey,
    sendMessageIndex: room.sendMessageIndex,
    expiresAt: room.expiresAt,
    participants: room.participants || []
  }));

  sessionStorage.setItem(ROOMS_KEY, JSON.stringify(serializable));
}

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY);
}

export function setStoredTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}
