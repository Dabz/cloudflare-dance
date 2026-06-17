import type { FC } from "react";
import styles from "./Banner.module.css";

interface BannerProps {
  label: string;
  message: string;
  onDismiss: () => void;
  countdownSeconds?: number;
  className?: string;
}

const Banner: FC<BannerProps> = ({ label, message, onDismiss, countdownSeconds, className = "" }) => (
  <section className={`${styles.Banner} ${className}`} data-testid="Banner" aria-live="polite">
    <span>{label}</span>
    <p>{message}</p>
    {countdownSeconds != null && <strong>{countdownSeconds}s</strong>}
    <button type="button" onClick={onDismiss}>Dismiss</button>
  </section>
);

export default Banner;
