import { useEffect, useState, type FC } from 'react';
import styles from './RoomMenuEntry.module.css';
import type {Room} from '../../../worker/model/room';
import {useNavigate} from 'react-router';
import { hc } from "hono/client";
import type {AppType} from '../../../worker';

interface RoomMenuEntryProps { room: Room }

const RoomMenuEntry: FC<RoomMenuEntryProps> = ({ room } ) => {
  const navigate = useNavigate()
  const [playerCount, setPlayerCount] = useState<number>()

  useEffect(() => {
    const client = hc<AppType>("/");
    client.api.room[':id'].player_count.$get({ param : {id: room.ID} }).then(async (res) => {
      const resRoom = await res.json();
      setPlayerCount(resRoom.playerCount)
    })
  }, [room.ID])

  function joinGameRoom(room: Room): void {
    navigate(`/room/${room.ID}`);
  }

  return (
    <div className={styles.RoomMenuEntry} data-testid="RoomMenuEntry">
      <div>
        <h1>{room.LOCATION}</h1>
        <p>Room {room.ID}</p>
      </div>
      {playerCount === undefined && (<h2>Loading</h2>) }
      {playerCount !== undefined && (
      <div className={styles.RoomMeta}>
        <h2>{playerCount}</h2>
        <span>players</span>
      </div>
      )}
      <button onClick={() => joinGameRoom(room)}>Join</button>
    </div>
  );
}

export default RoomMenuEntry;
