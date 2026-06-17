import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ChatPanel from './ChatPanel';

describe('<ChatPanel />', () => {
  test('should mount', () => {
    render(<ChatPanel open={false} chats={[]} draftMessage="" onToggle={() => {}} onDraftChange={() => {}} onSend={() => {}} />);

    const chatPanel = screen.getByTestId('ChatPanel');

    expect(chatPanel).toBeInTheDocument();
  });
});
