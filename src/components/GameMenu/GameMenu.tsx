import { useEffect, useState, type FC } from "react";
import styles from "./GameMenu.module.css";
import { hc } from "hono/client";
import type { AppType, RoomListResponse } from "../../../worker/index.ts";
import RoomMenuEntry from "../RoomMenuEntry/RoomMenuEntry.tsx";
import { getPlayerIdentity } from "../../security/auth.ts";
import { getDisplayNameCookie, sanitizeDisplayName, setDisplayNameCookie, UNKNOWN_DISPLAY_NAME } from "../../security/displayName.ts";

type ActiveModal = "displayName" | "rooms";

const GameMenu: FC = () => {
  const client = hc<AppType>("/");

  const [rooms, setRooms] = useState<RoomListResponse>();
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [serverDisplayName, setServerDisplayName] = useState<string>();
  const [activeModal, setActiveModal] = useState<ActiveModal>();
  const [openRoomsAfterName, setOpenRoomsAfterName] = useState(false);

  const identityLoaded = serverDisplayName !== undefined;
  const needsDisplayName = serverDisplayName === UNKNOWN_DISPLAY_NAME;
  const savedDisplayName = sanitizeDisplayName(displayName);
  const shownDisplayName = needsDisplayName ? savedDisplayName || "Unnamed visitor" : displayName;

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

  async function createRoom(loc: string) {
    const res = await client.api.room[":loc"].$post({param: {loc: loc}})
    const roomCreateResponse = await res.json()
    setRooms({
      rooms: [roomCreateResponse.room],
      roomsInLocation: [roomCreateResponse.room],
      roomsOutsideLocation: [],
      location: loc
    })
  }

  async function loadRooms() {
    setLoading(true);
    const rooms_list_response = await client.api.room.$get();
    const rooms = await rooms_list_response.json();
    setRooms(rooms);
    setLoading(false);
  }

  async function openRoomSelection() {
    if (!identityLoaded) return;

    if (needsDisplayName && !savedDisplayName) {
      setOpenRoomsAfterName(true);
      setActiveModal("displayName");
      return;
    }

    if (needsDisplayName) {
      setDisplayNameCookie(savedDisplayName);
    }

    setActiveModal("rooms");
    await loadRooms();
  }

  async function saveDisplayName() {
    if (!savedDisplayName) return;

    setDisplayName(savedDisplayName);
    setDisplayNameCookie(savedDisplayName);

    if (openRoomsAfterName) {
      setOpenRoomsAfterName(false);
      setActiveModal("rooms");
      await loadRooms();
      return;
    }

    setActiveModal(undefined);
  }

  function closeModal() {
    setOpenRoomsAfterName(false);
    setActiveModal(undefined);
  }

  return (
    <div className={styles.GameMenu} data-testid="GameMenu">
      <div className={styles.TopBar}>
        <span className={styles.BrandMark}>cf</span>
        <button className={styles.ProfileButton} disabled={!identityLoaded} onClick={() => setActiveModal("displayName")}>
          <span>Playing as</span>
          <strong>{identityLoaded ? shownDisplayName : "Loading..."}</strong>
        </button>
      </div>

      <main className={styles.HeroCard}>
        <div className={styles.HeroEyebrow}>Edge-native multiplayer</div>
        <h1>ORANGE DANCE!</h1>
        <p className={styles.Tagline}>Pick a name, find the closest room, and race the edge before anyone else claims the low-latency lane.</p>
        <div className={styles.HeroActions}>
          <button className={styles.PrimaryButton} disabled={!identityLoaded} onClick={openRoomSelection}>Find a room</button>
        </div>
      </main>

      {activeModal === "displayName" && (
        <div className={styles.ModalBackdrop} role="presentation">
          <section aria-labelledby="display-name-title" aria-modal="true" className={styles.ModalCard} role="dialog">
            <div className={styles.ModalHeader}>
              <div>
                <span className={styles.ModalKicker}>Identity</span>
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
                  {openRoomsAfterName ? "Save and find rooms" : "Save display name"}
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
                <span className={styles.ModalKicker}>Room browser</span>
                <h2 id="room-selection-title">Choose your edge room</h2>
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
                  <button className={styles.CreateRoomButton} onClick={() => createRoom(rooms.location)}>Create a room in {rooms.location}</button>
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
    </div>
  );
};

export default GameMenu;
