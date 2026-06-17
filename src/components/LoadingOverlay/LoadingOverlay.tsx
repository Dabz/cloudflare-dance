import type { FC } from "react";
import styles from "./LoadingOverlay.module.css";

interface LoadingOverlayProps {
  progress: number;
}

const LoadingOverlay: FC<LoadingOverlayProps> = ({ progress }) => (
  <section className={styles.LoadingOverlay} data-testid="LoadingOverlay" aria-label="Loading game scene" aria-live="polite">
    <div className={styles.LoadingCard}>
      <span className={styles.LoadingKicker}>Loading room</span>
      <strong>{progress}%</strong>
      <div className={styles.LoadingBar} aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p>Stealing the spotlight, unpacking the playground...</p>
    </div>
  </section>
);

export default LoadingOverlay;
