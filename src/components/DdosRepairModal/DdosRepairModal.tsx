import { useEffect, type FC } from "react";
import Modal from "../Modal/Modal";
import styles from "./DdosRepairModal.module.css";

interface DdosRepairModalProps {
  onRepair: () => void;
  onClose: () => void;
}

const DdosRepairModal: FC<DdosRepairModalProps> = ({ onRepair, onClose }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyE" || event.key.toLowerCase() === "e") {
        event.preventDefault();
        onRepair();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onRepair]);

  return (
    <Modal title="Repair TV" titleId="ddos-repair-title" closeLabel="Close TV repair" className={styles.DdosRepairModal} onClose={onClose}>
      <div className={styles.Content} data-testid="DdosRepairModal">
        <h2 id="ddos-repair-title">TV is on fire</h2>
        <p>The DDoS traffic overwhelmed the display. Press <kbd>E</kbd> to extinguish the fire and bring the TV back online.</p>
        <button type="button" className={styles.RepairButton} onClick={onRepair}>Press E to repair</button>
      </div>
    </Modal>
  );
};

export default DdosRepairModal;
