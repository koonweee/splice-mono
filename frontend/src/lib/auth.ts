import { useNavigate } from '@tanstack/react-router';
import {
  useUserControllerLogin,
  useUserControllerLogout,
  useUserControllerLogoutAll,
} from '../api/clients/spliceAPI';

const ACCESS_TOKEN_KEY = 'splice_access_token';
const REFRESH_TOKEN_KEY = 'splice_refresh_token';

export const tokenStorage = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),

  setAccessToken: (token: string): void => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },

  removeAccessToken: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  },

  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),

  setRefreshToken: (token: string): void => {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },

  removeRefreshToken: (): void => {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  setTokens: (accessToken: string, refreshToken: string): void => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  clearTokens: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  hasTokens: (): boolean => !!localStorage.getItem(ACCESS_TOKEN_KEY),
};

/**
 * Login hook that automatically stores tokens and navigates to home on success.
 * Use this instead of useUserControllerLogin directly.
 */
export function useLogin(options?: { redirectTo?: string }) {
  const navigate = useNavigate();
  const redirectTo = options?.redirectTo ?? '/';

  return useUserControllerLogin({
    mutation: {
      onSuccess: (data) => {
        tokenStorage.setTokens(data.accessToken, data.refreshToken);
        navigate({ to: redirectTo });
      },
    },
  });
}

/**
 * Logout hook that revokes the refresh token and clears local storage.
 * Use this instead of useUserControllerLogout directly.
 */
export function useLogout(options?: { redirectTo?: string }) {
  const navigate = useNavigate();
  const redirectTo = options?.redirectTo ?? '/login';

  return useUserControllerLogout({
    mutation: {
      onSuccess: () => {
        tokenStorage.clearTokens();
        navigate({ to: redirectTo });
      },
      onError: () => {
        // Even if the server request fails, clear tokens locally
        tokenStorage.clearTokens();
        navigate({ to: redirectTo });
      },
    },
  });
}

/**
 * Logout from all devices hook.
 * Use this instead of useUserControllerLogoutAll directly.
 */
export function useLogoutAll(options?: { redirectTo?: string }) {
  const navigate = useNavigate();
  const redirectTo = options?.redirectTo ?? '/login';

  return useUserControllerLogoutAll({
    mutation: {
      onSuccess: () => {
        tokenStorage.clearTokens();
        navigate({ to: redirectTo });
      },
      onError: () => {
        tokenStorage.clearTokens();
        navigate({ to: redirectTo });
      },
    },
  });
}
