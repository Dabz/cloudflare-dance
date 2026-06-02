import type { FC } from 'react';
import styles from './RoomMenuEntry.module.css';
import type {Room} from '../../../worker/model/room';
import {useNavigate} from 'react-router';

interface RoomMenuEntryProps { room: Room }

const RoomMenuEntry: FC<RoomMenuEntryProps> = ({ room } ) => {
  const navigate = useNavigate()

  function joinGameRoom(room: Room): void {
    navigate(`/room/${room.ID}`);
  }

  return (
    <div className={styles.RoomMenuEntry} data-testid="RoomMenuEntry">
      <div>
        <h1>{room.LOCATION}</h1>
        <p>Room {room.ID}</p>
      </div>
      <div className={styles.RoomMeta}>
        <h2>{room.PLAYER_COUNT}</h2>
        <span>players</span>
      </div>
      <button onClick={() => joinGameRoom(room)}>Join</button>
    </div>
  );
}

export default RoomMenuEntry;
