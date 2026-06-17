import { useRef, useState, type FC, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./MobileJoystick.module.css";

interface MobileJoystickProps {
  onMove: (x: number, z: number) => void;
}

const MobileJoystick: FC<MobileJoystickProps> = ({ onMove }) => {
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | undefined>(undefined);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function update(clientX: number, clientY: number) {
    const joystick = joystickRef.current;
    if (!joystick) return;
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxTravel = Math.max(1, Math.min(rect.width, rect.height) / 2 - 28);
    const rawX = clientX - centerX;
    const rawY = clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxTravel ? maxTravel / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    setOffset({ x, y });
    onMove(Math.abs(x / maxTravel) > 0.12 ? x / maxTravel : 0, Math.abs(y / maxTravel) > 0.12 ? -y / maxTravel : 0);
  }

  function release() {
    pointerIdRef.current = undefined;
    setOffset({ x: 0, y: 0 });
    onMove(0, 0);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event.clientX, event.clientY);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    update(event.clientX, event.clientY);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    release();
  }

  return (
    <div className={styles.MobileJoystickShell} data-testid="MobileJoystick" aria-label="Move character">
      <div ref={joystickRef} className={styles.MobileJoystick} onPointerCancel={onPointerUp} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} role="application">
        <span className={styles.MobileJoystickThumb} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} />
      </div>
    </div>
  );
};

export default MobileJoystick;
