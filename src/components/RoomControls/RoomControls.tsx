import type { FC } from "react";
import styles from "./RoomControls.module.css";

interface RoomControlsProps {
  onDance: () => void;
  onOpenCharacter: () => void;
  onOpenMenu: () => void;
}

const RoomControls: FC<RoomControlsProps> = ({ onDance, onOpenCharacter, onOpenMenu }) => (
  <section className={styles.RoomControls} data-testid="RoomControls" aria-label="Room controls">
    <div className={styles.PrimaryControls}>
      <button type="button" onClick={onDance}>Dance</button>
      <button type="button" className={styles.CharacterOpenButton} onClick={onOpenCharacter}>Character</button>
      <button type="button" className={styles.ControlsToggle} onClick={onOpenMenu}>Menu</button>
    </div>
  </section>
);

export default RoomControls;
