import type { FC } from "react";
import Banner from "../Banner/Banner";
import styles from "./RoomBanners.module.css";

interface RoomBannersProps {
  minigameNotice: string;
  roomAnnouncement: string;
  roomAnnouncementSeconds: number;
  onDismissMinigame: () => void;
  onDismissAnnouncement: () => void;
}

const RoomBanners: FC<RoomBannersProps> = ({ minigameNotice, roomAnnouncement, roomAnnouncementSeconds, onDismissMinigame, onDismissAnnouncement }) => (
  <div data-testid="RoomBanners">
    {minigameNotice && <Banner label="DDoS" message={minigameNotice} onDismiss={onDismissMinigame} />}
    {roomAnnouncement && <Banner label="Room" message={roomAnnouncement} countdownSeconds={roomAnnouncementSeconds} className={styles.RoomAnnouncement} onDismiss={onDismissAnnouncement} />}
  </div>
);

export default RoomBanners;
