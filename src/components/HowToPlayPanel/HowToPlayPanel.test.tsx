import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HowToPlayPanel from './HowToPlayPanel';

describe('<HowToPlayPanel />', () => {
  test('should mount', () => {
    render(<HowToPlayPanel open={false} onToggle={() => {}} />);

    const howToPlayPanel = screen.getByTestId('HowToPlayPanel');

    expect(howToPlayPanel).toBeInTheDocument();
  });
});
