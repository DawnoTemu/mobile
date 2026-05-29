import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

const mockShowToast = jest.fn();
jest.mock('../../components/StatusToast', () => ({
  useToast: () => ({ showToast: mockShowToast })
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather'
}));

const mockLogin = jest.fn();
jest.mock('../../services/authService', () => ({
  login: (...args) => mockLogin(...args)
}));

const mockVerifyVoiceExists = jest.fn();
jest.mock('../../services/voiceService', () => ({
  verifyVoiceExists: (...args) => mockVerifyVoiceExists(...args)
}));

import LoginScreen from '../LoginScreen';

function setup() {
  const navigation = { navigate: jest.fn(), replace: jest.fn() };
  const utils = render(<LoginScreen navigation={navigation} />);
  return { navigation, ...utils };
}

async function submit(utils, email = 'parent@example.com', password = 'Password123') {
  fireEvent.changeText(utils.getByPlaceholderText('Adres e-mail'), email);
  fireEvent.changeText(utils.getByPlaceholderText('Hasło'), password);
  fireEvent.press(utils.getByTestId('login-submit'));
}

describe('LoginScreen — unconfirmed-email routing', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockVerifyVoiceExists.mockReset();
    mockShowToast.mockReset();
  });

  it('routes to ConfirmEmail when the backend returns code EMAIL_NOT_CONFIRMED', async () => {
    mockLogin.mockResolvedValue({
      success: false,
      status: 403,
      // authService overwrites top-level `code` with an HTTP-status code, so the
      // backend's stable code lands at result.data.code:
      code: 'FORBIDDEN',
      error: 'Please confirm your email address before logging in.',
      data: { code: 'EMAIL_NOT_CONFIRMED' }
    });

    const utils = setup();
    await submit(utils, 'unconfirmed@example.com');

    await waitFor(() => {
      expect(utils.navigation.navigate).toHaveBeenCalledWith('ConfirmEmail', {
        email: 'unconfirmed@example.com'
      });
    });
  });

  it('routes to ConfirmEmail via message fallback when no code is present', async () => {
    // Older backend wording: message contains "confirmation" but no stable code.
    // The previous `.includes('confirmed')` check never matched this and stranded users.
    mockLogin.mockResolvedValue({
      success: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Please confirm your email address. Check your email for the confirmation link.',
      data: {}
    });

    const utils = setup();
    await submit(utils, 'legacy@example.com');

    await waitFor(() => {
      expect(utils.navigation.navigate).toHaveBeenCalledWith('ConfirmEmail', {
        email: 'legacy@example.com'
      });
    });
  });

  it('does NOT route to ConfirmEmail on invalid credentials', async () => {
    mockLogin.mockResolvedValue({
      success: false,
      status: 401,
      code: 'AUTH_ERROR',
      error: 'Invalid email or password',
      data: { error: 'Invalid email or password' }
    });

    const utils = setup();
    await submit(utils);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalled();
    });
    expect(utils.navigation.navigate).not.toHaveBeenCalledWith(
      'ConfirmEmail',
      expect.anything()
    );
  });

  it('navigates to Synthesis on success when the user already has a voice', async () => {
    mockLogin.mockResolvedValue({ success: true, data: { user: { id: 1 } } });
    mockVerifyVoiceExists.mockResolvedValue({ exists: true });

    const utils = setup();
    await submit(utils);

    await waitFor(() => {
      expect(utils.navigation.replace).toHaveBeenCalledWith('Synthesis');
    });
    expect(utils.navigation.navigate).not.toHaveBeenCalledWith(
      'ConfirmEmail',
      expect.anything()
    );
  });
});
