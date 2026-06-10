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
  const [pingMs, setPingMs] = useState<number>()

  useEffect(() => {
    let disposed = false;
    const client = hc<AppType>("/");
    const startedAt = performance.now();
    client.api.room[':id'].player_count.$get({ param : {id: room.ID} }).then(async (res) => {
      const resRoom = await res.json();
      if (disposed) return;
      setPlayerCount(resRoom.playerCount)
      setPingMs(Math.round(performance.now() - startedAt))
    })

    return () => {
      disposed = true;
    }
  }, [room.ID])

  function joinGameRoom(room: Room): void {
    navigate(`/room/${room.ID}`);
  }

  return (
    <div className={styles.RoomMenuEntry} data-testid="RoomMenuEntry">
      <div>
        <h1>{room.ID}</h1>
        <p>{room.LOCATION}</p>
      </div>
      <div className={styles.RoomMeta}>
        <h2>{playerCount ?? "--"}</h2>
        <span>players</span>
      </div>
      <div className={styles.RoomMeta}>
        <h2>{pingMs ?? "--"}</h2>
        <span>ms</span>
      </div>
      <button onClick={() => joinGameRoom(room)}>Join</button>
    </div>
  );
}

export default RoomMenuEntry;
