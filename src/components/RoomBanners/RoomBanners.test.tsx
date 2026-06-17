import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RoomBanners from './RoomBanners';

describe('<RoomBanners />', () => {
  test('should mount', () => {
    render(<RoomBanners minigameNotice="" roomAnnouncement="" roomAnnouncementSeconds={0} onDismissMinigame={() => {}} onDismissAnnouncement={() => {}} />);

    const roomBanners = screen.getByTestId('RoomBanners');

    expect(roomBanners).toBeInTheDocument();
  });
});
