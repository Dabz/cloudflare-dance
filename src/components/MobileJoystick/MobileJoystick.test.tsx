import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MobileJoystick from './MobileJoystick';

describe('<MobileJoystick />', () => {
  test('should mount', () => {
    render(<MobileJoystick onMove={() => {}} />);

    const mobileJoystick = screen.getByTestId('MobileJoystick');

    expect(mobileJoystick).toBeInTheDocument();
  });
});
