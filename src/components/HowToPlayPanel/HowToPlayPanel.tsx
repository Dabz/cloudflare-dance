import type { FC } from "react";
import styles from "./HowToPlayPanel.module.css";

interface HowToPlayPanelProps {
  open: boolean;
  onToggle: () => void;
}

const HowToPlayPanel: FC<HowToPlayPanelProps> = ({ open, onToggle }) => (
  <section className={styles.HowToPlayPanel} data-testid="HowToPlayPanel" aria-label="How to play">
    <button type="button" className={styles.KeyboardHelpToggle} aria-expanded={open} onClick={onToggle}>
      <span className={styles.PanelKicker}>How to play</span>
      <span>{open ? "Hide" : "Show"}</span>
    </button>
    {open && (
      <dl>
        <div><dt><kbd>WASD</kbd> <span>or</span> <kbd>Arrows</kbd></dt><dd>Move</dd></div>
        <div><dt><kbd>Space</kbd></dt><dd>Jump</dd></div>
        <div><dt><kbd>E</kbd></dt><dd>Use nearby toys</dd></div>
        <div><dt><kbd>Q</kbd></dt><dd>Dance</dd></div>
        <div><dt><kbd>Mouse drag</kbd></dt><dd>Look around</dd></div>
      </dl>
    )}
  </section>
);

export default HowToPlayPanel;
