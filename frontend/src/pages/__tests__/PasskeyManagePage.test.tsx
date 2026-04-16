import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import PasskeyManagePage from '../PasskeyManagePage';
import { renderWithRouter } from '../../tests/test-utils';

// Mock @simplewebauthn/browser
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => false,
  startRegistration: vi.fn(),
}));

describe('PasskeyManagePage', () => {
  it('should render passkey manage page with title', () => {
    renderWithRouter(<PasskeyManagePage />);

    expect(screen.getByText('Passkey 管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回/ })).toBeInTheDocument();
  });

  it('should show unsupported message when browser does not support WebAuthn', () => {
    renderWithRouter(<PasskeyManagePage />);

    expect(screen.getByText('浏览器不支持')).toBeInTheDocument();
  });
});
