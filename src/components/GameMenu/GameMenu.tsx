import { useEffect, useState, type FC } from "react";
import styles from "./GameMenu.module.css";
import { hc } from "hono/client";
import type { AppType, RoomListResponse } from "../../../worker/index.ts";
import type { Room } from "../../../worker/model/room.ts";
import RoomMenuEntry from "../RoomMenuEntry/RoomMenuEntry.tsx";
import { getPlayerIdentity } from "../../security/auth.ts";
import { getDisplayNameCookie, sanitizeDisplayName, setDisplayNameCookie, UNKNOWN_DISPLAY_NAME } from "../../security/displayName.ts";

type ActiveModal = "displayName" | "rooms" | "createRoom";
type MenuAction = "join" | "rooms" | "create";

const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;

const GameMenu: FC = () => {
  const client = hc<AppType>("/");

  const [rooms, setRooms] = useState<RoomListResponse>();
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [serverDisplayName, setServerDisplayName] = useState<string>();
  const [activeModal, setActiveModal] = useState<ActiveModal>();
  const [queuedAction, setQueuedAction] = useState<MenuAction>();
  const [actionLoading, setActionLoading] = useState<MenuAction>();
  const [createRoomLocation, setCreateRoomLocation] = useState<string>();
  const [roomId, setRoomId] = useState("");
  const [roomIdError, setRoomIdError] = useState<string>();

  const identityLoaded = serverDisplayName !== undefined;
  const needsDisplayName = serverDisplayName === UNKNOWN_DISPLAY_NAME;
  const savedDisplayName = sanitizeDisplayName(displayName);

  useEffect(() => {
    let disposed = false;

    async function loadIdentity() {
      const identity = await getPlayerIdentity();
      if (disposed) return;

      const displayNameCookie = getDisplayNameCookie();
      setServerDisplayName(identity.displayName);
      setDisplayName(identity.displayName === UNKNOWN_DISPLAY_NAME ? displayNameCookie ?? "" : identity.displayName);
      if (identity.displayName === UNKNOWN_DISPLAY_NAME && !displayNameCookie) {
        setActiveModal("displayName");
      }
    }

    void loadIdentity();

    return () => {
      disposed = true;
    };
  }, []);

  const savedRoomId = roomId.trim();

  async function createRoom(loc: string, roomId: string): Promise<Room> {
    const res = await client.api.room[":loc"].$post({param: {loc: loc}, json: {roomId}})
    const roomCreateResponse = await res.json()
    if (!res.ok) {
      throw new Error("error" in roomCreateResponse ? roomCreateResponse.error : "Room could not be created.");
    }
    return roomCreateResponse.room;
  }

  async function loadRooms(): Promise<RoomListResponse> {
    setLoading(true);
    try {
      const rooms_list_response = await client.api.room.$get();
      const rooms = await rooms_list_response.json();
      setRooms(rooms);
      return rooms;
    } finally {
      setLoading(false);
    }
  }

  function joinRoom(room: Room) {
    window.location.assign(`/room/${encodeURIComponent(room.ID)}`);
  }

  function pickClosestRoom(roomData: RoomListResponse): Room | undefined {
    const closestRooms = [...roomData.roomsInLocation].sort((l, r) => l.PLAYER_COUNT - r.PLAYER_COUNT);
    const fallbackRooms = [...roomData.rooms].sort((l, r) => l.PLAYER_COUNT - r.PLAYER_COUNT);
    return closestRooms[0] ?? fallbackRooms[0];
  }

  function canRunAction(action: MenuAction) {
    if (!identityLoaded) return false;

    if (needsDisplayName && !savedDisplayName) {
      setQueuedAction(action);
      setActiveModal("displayName");
      return false;
    }

    if (needsDisplayName) {
      setDisplayNameCookie(savedDisplayName);
    }

    return true;
  }

  async function runMenuAction(action: MenuAction) {
    if (!canRunAction(action)) return;

    setActionLoading(action);
    try {
      if (action === "rooms") {
        setActiveModal("rooms");
        await loadRooms();
        return;
      }

      const roomData = rooms ?? await loadRooms();
      if (action === "join") {
        const room = pickClosestRoom(roomData);
        if (room) {
          joinRoom(room);
          return;
        }

        openCreateRoomModal(roomData.location);
        return;
      }

      openCreateRoomModal(roomData.location);
    } finally {
      setActionLoading(undefined);
    }
  }

  function openCreateRoomModal(loc: string) {
    setCreateRoomLocation(loc);
    setRoomId("");
    setRoomIdError(undefined);
    setActiveModal("createRoom");
  }

  async function submitCreateRoom() {
    if (!createRoomLocation) return;

    if (!ROOM_ID_PATTERN.test(savedRoomId)) {
      setRoomIdError("Use 3-32 letters, numbers, dashes, or underscores.");
      return;
    }

    setActionLoading("create");
    setRoomIdError(undefined);
    try {
      const room = await createRoom(createRoomLocation, savedRoomId);
      joinRoom(room);
    } catch (error) {
      setRoomIdError(error instanceof Error ? error.message : "Room could not be created.");
    } finally {
      setActionLoading(undefined);
    }
  }

  async function saveDisplayName() {
    if (!savedDisplayName) return;

    setDisplayName(savedDisplayName);
    setDisplayNameCookie(savedDisplayName);

    if (queuedAction) {
      const action = queuedAction;
      setQueuedAction(undefined);
      setActiveModal(undefined);
      await runMenuAction(action);
      return;
    }

    setActiveModal(undefined);
  }

  function closeModal() {
    setQueuedAction(undefined);
    setRoomIdError(undefined);
    setActiveModal(undefined);
  }

  return (
    <div className={styles.GameMenu} data-testid="GameMenu">
      <div className={styles.MenuBackdrop} aria-hidden="true">
        <span className={styles.SlashOne}></span>
        <span className={styles.SlashTwo}></span>
        <span className={styles.DotGrid}></span>
      </div>

      <main className={styles.MenuPanel} aria-label="Main menu">
        <button
          aria-busy={actionLoading === "join"}
          className={`${styles.MenuEntry} ${styles.MenuEntryPrimary}`}
          disabled={!identityLoaded || actionLoading !== undefined}
          onClick={() => void runMenuAction("join")}
        >
          Join closest Room
        </button>
        <button
          aria-busy={actionLoading === "rooms" || loading}
          className={styles.MenuEntry}
          disabled={!identityLoaded || actionLoading !== undefined}
          onClick={() => void runMenuAction("rooms")}
        >
          See rooms
        </button>
        <button
          aria-busy={actionLoading === "create"}
          className={styles.MenuEntry}
          disabled={!identityLoaded || actionLoading !== undefined}
          onClick={() => void runMenuAction("create")}
        >
          Create a new Room
        </button>
      </main>

      {activeModal === "displayName" && (
        <div className={styles.ModalBackdrop} role="presentation">
          <section aria-labelledby="display-name-title" aria-modal="true" className={styles.ModalCard} role="dialog">
            <div className={styles.ModalHeader}>
              <div>
                <h2 id="display-name-title">Choose your display name</h2>
              </div>
              <button className={styles.IconButton} onClick={closeModal}>Close</button>
            </div>

            {!needsDisplayName && (
              <p className={styles.ModalCopy}>Cloudflare Access already provided your display name.</p>
            )}
            {needsDisplayName && (
              <form className={styles.DisplayNameForm} onSubmit={(event) => { event.preventDefault(); void saveDisplayName(); }}>
                <label className={styles.DisplayNameField}>
                  <span>Display name</span>
                  <input
                    autoFocus
                    maxLength={40}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Pick a name"
                    type="text"
                    value={displayName}
                  />
                </label>
                <button className={styles.PrimaryButton} disabled={!savedDisplayName} type="submit">
                  {queuedAction ? "Save" : "Save display name"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}

      {activeModal === "rooms" && (
        <div className={styles.ModalBackdrop} role="presentation">
          <section aria-labelledby="room-selection-title" aria-modal="true" className={`${styles.ModalCard} ${styles.RoomModal}`} role="dialog">
            <div className={styles.ModalHeader}>
              <div>
                <h2 id="room-selection-title">Rooms</h2>
              </div>
              <button className={styles.IconButton} onClick={closeModal}>Close</button>
            </div>

            {loading && <p className={styles.LoadingText}>Scanning nearby rooms...</p>}
            {!loading && rooms && (
              <div className={styles.RoomSections}>
                <div className={styles.RoomSectionHeader}>
                  <h3>Close to you</h3>
                  <span>{rooms.location}</span>
                </div>
                <div className={styles.RoomList}>
                  {[...rooms.roomsInLocation].sort((l, r) => l.PLAYER_COUNT - r.PLAYER_COUNT).map((room) => (
                    <RoomMenuEntry key={room.ID} room={room} />
                  ))}
                </div>
                {rooms.roomsInLocation.length === 0 && (
                  <button className={styles.CreateRoomButton} onClick={() => openCreateRoomModal(rooms.location)}>Create a new Room</button>
                )}

                {rooms.roomsOutsideLocation.length > 0 && (
                  <>
                    <div className={styles.RoomSectionHeader}>
                      <h3>A little farther out</h3>
                      <span>Still playable</span>
                    </div>
                    <div className={styles.RoomList}>
                      {[...rooms.roomsOutsideLocation].sort((l, r) => l.PLAYER_COUNT - r.PLAYER_COUNT).map((room) => (
                        <RoomMenuEntry key={room.ID} room={room} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {activeModal === "createRoom" && (
        <div className={styles.ModalBackdrop} role="presentation">
          <section aria-labelledby="create-room-title" aria-modal="true" className={styles.ModalCard} role="dialog">
            <div className={styles.ModalHeader}>
              <div>
                <h2 id="create-room-title">Create Room</h2>
              </div>
              <button className={styles.IconButton} onClick={closeModal}>Close</button>
            </div>

            <form className={styles.DisplayNameForm} onSubmit={(event) => { event.preventDefault(); void submitCreateRoom(); }}>
              <label className={styles.DisplayNameField}>
                <span>Room ID</span>
                <input
                  autoFocus
                  maxLength={32}
                  onChange={(event) => {
                    setRoomId(event.target.value);
                    setRoomIdError(undefined);
                  }}
                  placeholder="orange-room"
                  type="text"
                  value={roomId}
                />
              </label>
              {roomIdError && <p className={styles.ErrorText}>{roomIdError}</p>}
              <button className={styles.PrimaryButton} disabled={actionLoading === "create" || !savedRoomId} type="submit">
                Create a new Room
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default GameMenu;
