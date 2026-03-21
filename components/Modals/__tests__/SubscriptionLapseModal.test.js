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
    white: '#FFFFFF',
    peach: '#FF6B6B',
    text: { primary: '#2D2D3A', secondary: '#6E6E80' }
  }
}));

import SubscriptionLapseModal from '../SubscriptionLapseModal';

describe('SubscriptionLapseModal', () => {
  const defaultProps = {
    visible: true,
    onSubscribe: jest.fn(),
    onDismiss: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders nothing when not visible', () => {
    const { queryByText } = render(
      <SubscriptionLapseModal {...defaultProps} visible={false} />
    );
    expect(queryByText('Twoja subskrypcja wygasła')).toBeNull();
  });

  test('renders title and message when visible', () => {
    const { getByText } = render(
      <SubscriptionLapseModal {...defaultProps} />
    );

    expect(getByText('Twoja subskrypcja wygasła')).toBeTruthy();
    expect(getByText(/Odtwarzaj zapisane bajki/)).toBeTruthy();
  });

  test('renders both action buttons', () => {
    const { getByText } = render(
      <SubscriptionLapseModal {...defaultProps} />
    );

    expect(getByText('Później')).toBeTruthy();
    expect(getByText('Odnów subskrypcję')).toBeTruthy();
  });

  test('calls onDismiss when dismiss button is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <SubscriptionLapseModal {...defaultProps} onDismiss={onDismiss} />
    );

    fireEvent.press(getByText('Później'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('calls onSubscribe when subscribe button is pressed', () => {
    const onSubscribe = jest.fn();
    const { getByText } = render(
      <SubscriptionLapseModal {...defaultProps} onSubscribe={onSubscribe} />
    );

    fireEvent.press(getByText('Odnów subskrypcję'));
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });
});
