export const state = {
  rooms: new Map(),
  currentRoomId: null,
  pendingInvite: null,
  pollTimer: null,
  toastTimer: null
};

export function getCurrentRoom() {
  if (!state.currentRoomId) return null;

  return state.rooms.get(state.currentRoomId) || null;
}
