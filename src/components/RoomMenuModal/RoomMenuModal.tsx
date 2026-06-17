import type { FC } from "react";
import Modal from "../Modal/Modal";
import styles from "./RoomMenuModal.module.css";

interface RoomMenuModalProps { minigameEnabled: boolean; onClose: () => void; onReset: () => void; onMainMenu: () => void; onStartDdos: () => void; onStartFixPop: () => void; onToggleDdos: (enabled: boolean) => void; }

const RoomMenuModal: FC<RoomMenuModalProps> = ({ minigameEnabled, onClose, onReset, onMainMenu, onStartDdos, onStartFixPop, onToggleDdos }) => (
  <Modal title="Room Menu" titleId="menu-display-title" closeLabel="Close room menu" className={styles.MenuDisplayPopup} onClose={onClose}>
    <div className={styles.MenuPopupIntro} data-testid="RoomMenuModal"><h2 id="menu-display-title">Room controls</h2><p>Reset your position or leave this room.</p></div>
    <div className={styles.MenuActions}><button type="button" onClick={onReset}>Reset position</button><button type="button" onClick={onMainMenu}>Main Menu</button></div>
    <button type="button" className={styles.StartMinigameButton} onClick={onStartDdos}>Start DDoS now</button>
    <button type="button" className={styles.StartMinigameButton} onClick={onStartFixPop}>Start Fix POP now</button>
    <label className={styles.MinigameToggle}><input type="checkbox" checked={minigameEnabled} onChange={(event) => onToggleDdos(event.target.checked)} /><span>DDoS minigame enabled</span></label>
  </Modal>
);

export default RoomMenuModal;
