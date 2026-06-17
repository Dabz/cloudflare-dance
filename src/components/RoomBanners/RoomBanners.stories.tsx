import RoomBanners from './RoomBanners';

export default {
  title: 'RoomBanners',
  component: RoomBanners,
};

export const Default = { args: { minigameNotice: "DDoS started", roomAnnouncement: "TV changed", roomAnnouncementSeconds: 30, onDismissMinigame: () => {}, onDismissAnnouncement: () => {} } };
