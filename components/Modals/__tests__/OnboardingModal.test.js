import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-blur', () => ({
  BlurView: ({ children, ...props }) => <>{children}</>
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null
}));

jest.mock('../../../styles/colors', () => ({
  COLORS: {
    lavender: '#7C6FE0',
    lavenderSoft: '#EDE9FF',
    white: '#FFFFFF',
    text: { primary: '#2D2D3A', secondary: '#6E6E80', tertiary: '#A0A0B0' }
  }
}));

jest.mock('../../../utils/pluralize', () => ({
  pluralizeDays: jest.fn((n) => (n === 1 ? 'dzień' : 'dni'))
}));

import OnboardingModal from '../OnboardingModal';

describe('OnboardingModal', () => {
  const defaultProps = {
    visible: true,
    trialDays: 7,
    priceLabel: '29,99 zł',
    onDismiss: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders nothing when not visible', () => {
    const { queryByText } = render(
      <OnboardingModal {...defaultProps} visible={false} />
    );
    expect(queryByText('Witaj w DawnoTemu!')).toBeNull();
  });

  test('renders title and features when visible', () => {
    const { getByText } = render(<OnboardingModal {...defaultProps} />);

    expect(getByText('Witaj w DawnoTemu!')).toBeTruthy();
    expect(getByText('10 Punktów Magii na start')).toBeTruthy();
    expect(getByText('Nagrywanie głosu')).toBeTruthy();
    expect(getByText('Generowanie bajek')).toBeTruthy();
    expect(getByText('Odtwarzanie offline')).toBeTruthy();
  });

  test('displays trial days in subtitle', () => {
    const { getByText } = render(<OnboardingModal {...defaultProps} />);
    expect(getByText(/7 dni za darmo/)).toBeTruthy();
  });

  test('shows generic trial text when trialDays is invalid', () => {
    const { getByText } = render(
      <OnboardingModal {...defaultProps} trialDays={null} />
    );
    expect(getByText(/darmowy okres próbny/)).toBeTruthy();
  });

  test('displays price label after trial info', () => {
    const { getByText } = render(<OnboardingModal {...defaultProps} />);
    expect(getByText(/29,99 zł/)).toBeTruthy();
  });

  test('hides price text when priceLabel is null', () => {
    const { queryByText } = render(
      <OnboardingModal {...defaultProps} priceLabel={null} />
    );
    expect(queryByText(/Po okresie próbnym/)).toBeNull();
  });

  test('calls onDismiss when CTA button is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <OnboardingModal {...defaultProps} onDismiss={onDismiss} />
    );

    fireEvent.press(getByText('Zaczynamy!'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
