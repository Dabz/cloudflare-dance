import { useState, type FC } from "react";
import styles from "./GameMenu.module.css";
import { hc } from "hono/client";
import type { AppType, RoomListResponse } from "../../../worker/index.ts";
import RoomMenuEntry from "../RoomMenuEntry/RoomMenuEntry.tsx";

interface GameMenuProps {}

const GameMenu: FC<GameMenuProps> = () => {
  const client = hc<AppType>("/");

  const [rooms, setRooms] = useState<RoomListResponse>();
  const [startGame, setStartGame] = useState(false);
  const [loading, setLoading] = useState(false);

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

  async function ClickedStartGame() {
    setLoading(true);
    setStartGame(true);
    const rooms_list_response = await client.api.room.$get();
    const rooms = await rooms_list_response.json();
    setRooms(rooms);
    setLoading(false);
  }

  return (
    <>
      <div className={styles.GameMenu} data-testid="GameMenu">
        <h1>Cloudflare, Please</h1>
        <div id="main-menu">
          <button onClick={ClickedStartGame}>Join game</button>
        </div>

        {startGame && (
          <>
            <div className={styles.GameConfirmation}>
              {loading && (
                <>
                  <h1>Loading...</h1>
                </>
              )}
              {!loading && (
                <>
                  <div>
                    {rooms.roomsInLocation.length > 0 && (
                      <h1>Rooms close to you!</h1>
                    )}
                    {rooms.roomsInLocation.sort((l, r) => l.PLAYER_COUNT - r.PLAYER_COUNT).map((room) => (
                      <RoomMenuEntry key={room.ID} room={room} />
                    ))}
                    { rooms.roomsInLocation.length == 0 && 
                      <button onClick={() => createRoom(rooms.location)}>Create a new room in your location?</button>
                    }

                    {rooms.roomsOutsideLocation.length > 0 && (
                      <h1>Rooms a little bit far but still ok!</h1>
                    )}
                    {rooms.roomsOutsideLocation.sort((l, r) => l.PLAYER_COUNT - r.PLAYER_COUNT).map((room) => (
                      <>
                      <RoomMenuEntry key={room.ID} room={room} />
                      </>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default GameMenu;
