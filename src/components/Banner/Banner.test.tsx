import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Banner from './Banner';

describe('<Banner />', () => {
  test('should mount', () => {
    render(<Banner label="Room" message="Hello" onDismiss={() => {}} />);

    const banner = screen.getByTestId('Banner');

    expect(banner).toBeInTheDocument();
  });
});
