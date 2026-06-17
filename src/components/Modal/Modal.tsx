import type { FC, ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  title: string;
  titleId: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

const Modal: FC<ModalProps> = ({ title, titleId, closeLabel, onClose, children, className = "" }) => (
  <div className={styles.Backdrop} data-testid="Modal" role="presentation" onMouseDown={onClose}>
    <section
      className={`${styles.Modal} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className={styles.Header}>
        <span>{title}</span>
        <button type="button" aria-label={closeLabel} onClick={onClose}>Close</button>
      </div>
      {children}
    </section>
  </div>
);

export default Modal;
