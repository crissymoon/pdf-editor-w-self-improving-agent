import { setSanitizedHtml } from '../utils/safeHtml';

const AUTH_BASE_URL = 'http://127.0.0.1:9100';
const AUTH_TIMEOUT_MS = 3000;
const FALLBACK_ADMIN_PASSWORD = String(import.meta.env.VITE_ADMIN_PASSWORD ?? 'admin').trim() || 'admin';
const REMEMBER_ME_KEY = 'xcm_editor_remember_me';
const REMEMBER_USERNAME_KEY = 'xcm_editor_username';
const REMEMBER_MODE_KEY = 'xcm_editor_login_mode';

type LoginMode = 'xcm_auth' | 'fallback';

interface XcmAuthLoginResponse {
  ok?: boolean;
  message?: string;
  data?: {
    twofa_required?: boolean;
    [key: string]: unknown;
  };
}

export async function requireEditorLogin(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Missing app root element.');
  }

  const xcmAuthAvailable = await isXcmAuthAvailable();
  const rememberedMode = (localStorage.getItem(REMEMBER_MODE_KEY) || '').trim() as LoginMode;
  const rememberMeStored = localStorage.getItem(REMEMBER_ME_KEY) === '1';
  const rememberedUsername = (localStorage.getItem(REMEMBER_USERNAME_KEY) || '').trim();

  let mode: LoginMode = xcmAuthAvailable ? 'xcm_auth' : 'fallback';
  if (rememberedMode === 'xcm_auth' || rememberedMode === 'fallback') {
    mode = rememberedMode === 'xcm_auth' && !xcmAuthAvailable ? 'fallback' : rememberedMode;
  }

  let rememberMe = rememberMeStored;
  let usernameValue = rememberedUsername;

  return new Promise((resolve) => {
    const render = (statusMessage = '') => {
      const modeTitle = 'Sign In';
      const modeHint = mode === 'xcm_auth'
        ? 'User sign-in is active through xcm_auth.'
        : 'User sign-in is running in local fallback mode.';

      setSanitizedHtml(root, `
        <div class="xcm-login-shell">
          <div class="xcm-login-backdrop"></div>
          <div class="xcm-login-modal" role="dialog" aria-modal="true" aria-labelledby="xcm-login-title">
            <div class="xcm-login-brand">XCM-PDF Editor</div>
            <h2 class="xcm-login-title" id="xcm-login-title">${modeTitle}</h2>
            <p class="xcm-login-subtitle">${modeHint}</p>
            <form class="xcm-login-form" id="xcm-login-form">
              <label class="xcm-login-label" for="xcm-login-identifier">Username</label>
              <input class="xcm-login-input xcm-login-input-compact" id="xcm-login-identifier" autocomplete="username" placeholder="username" value="${escapeHtml(usernameValue)}" required />
              <label class="xcm-login-label" for="xcm-login-password">Password</label>
              <div class="xcm-login-password-wrap">
                <input class="xcm-login-input xcm-login-input-password xcm-login-input-compact" id="xcm-login-password" type="password" autocomplete="current-password" placeholder="password" required />
                <button class="xcm-login-password-toggle" id="xcm-login-password-toggle" type="button" aria-label="Show password" title="Show password"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
              </div>
              <label class="xcm-login-remember" for="xcm-login-remember">
                <input id="xcm-login-remember" type="checkbox" ${rememberMe ? 'checked' : ''}>
                <span>Remember me</span>
              </label>
              <div class="xcm-login-row">
                <button class="btn btn-primary xcm-login-submit" id="xcm-login-submit" type="submit">Sign In</button>
                <button class="btn btn-secondary xcm-login-switch" id="xcm-login-switch" type="button">Use ${mode === 'xcm_auth' ? 'fallback' : 'xcm_auth'}</button>
              </div>
              <p class="xcm-login-dev-info">Dev mode: username: any, password: ${escapeHtml(FALLBACK_ADMIN_PASSWORD)}</p>
              <p class="xcm-login-note">2FA is currently disabled for this editor login flow.</p>
              <div class="xcm-login-status" id="xcm-login-status">${escapeHtml(statusMessage)}</div>
            </form>
          </div>
        </div>
      `);

      const form = document.getElementById('xcm-login-form') as HTMLFormElement | null;
      const passwordInput = document.getElementById('xcm-login-password') as HTMLInputElement | null;
      const identifierInput = document.getElementById('xcm-login-identifier') as HTMLInputElement | null;
      const submitButton = document.getElementById('xcm-login-submit') as HTMLButtonElement | null;
      const switchButton = document.getElementById('xcm-login-switch') as HTMLButtonElement | null;
      const rememberInput = document.getElementById('xcm-login-remember') as HTMLInputElement | null;
      const passwordToggle = document.getElementById('xcm-login-password-toggle') as HTMLButtonElement | null;
      const status = document.getElementById('xcm-login-status') as HTMLDivElement | null;

      if (!form || !passwordInput || !identifierInput || !submitButton || !switchButton || !rememberInput || !passwordToggle || !status) {
        return;
      }

      identifierInput.focus();

      const eyeOpen = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      const eyeClosed = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      passwordToggle.addEventListener('click', () => {
        const showing = passwordInput.type === 'text';
        passwordInput.type = showing ? 'password' : 'text';
        passwordToggle.innerHTML = showing ? eyeOpen : eyeClosed;
        passwordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        passwordToggle.setAttribute('title', showing ? 'Show password' : 'Hide password');
      });

      rememberInput.addEventListener('change', () => {
        rememberMe = rememberInput.checked;
      });

      switchButton.addEventListener('click', async () => {
        usernameValue = identifierInput.value.trim();
        rememberMe = rememberInput.checked;

        if (mode === 'fallback') {
          const available = await isXcmAuthAvailable();
          mode = available ? 'xcm_auth' : 'fallback';
          render(available ? 'xcm_auth detected.' : 'xcm_auth is still unavailable.');
          return;
        }

        mode = 'fallback';
        render('Switched to fallback admin login.');
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submitButton.disabled = true;
        switchButton.disabled = true;
        status.textContent = 'Signing in...';

        const password = passwordInput.value;
        const identifier = identifierInput.value.trim();
        rememberMe = rememberInput.checked;
        usernameValue = identifier;

        if (!identifier) {
          status.textContent = 'Username is required.';
          submitButton.disabled = false;
          switchButton.disabled = false;
          return;
        }

        try {
          if (mode === 'xcm_auth') {
            const authResult = await loginWithXcmAuth(identifier, password);
            if (authResult.success) {
              persistRememberState({ rememberMe, username: identifier, mode: 'xcm_auth' });
              sessionStorage.setItem('xcm_editor_auth_mode', 'xcm_auth');
              resolve();
              return;
            }

            if (authResult.unavailable) {
              mode = 'fallback';
              render('xcm_auth unavailable. Fallback admin login enabled.');
              return;
            }

            status.textContent = authResult.message;
          } else {
            if (password === FALLBACK_ADMIN_PASSWORD) {
              persistRememberState({ rememberMe, username: identifier, mode: 'fallback' });
              sessionStorage.setItem('xcm_editor_auth_mode', 'fallback');
              resolve();
              return;
            }
            status.textContent = 'Invalid username or password.';
          }
        } catch (_error) {
          status.textContent = 'Unable to complete login. Try again.';
        } finally {
          submitButton.disabled = false;
          switchButton.disabled = false;
        }
      });
    };

    render();
  });
}

async function isXcmAuthAvailable(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${AUTH_BASE_URL}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

async function loginWithXcmAuth(identifier: string, password: string): Promise<{ success: boolean; message: string; unavailable?: boolean }> {
  if (!identifier) {
    return { success: false, message: 'Username is required.' };
  }

  try {
    const response = await fetchWithTimeout(`${AUTH_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier,
        password,
      }),
    });

    const payload = (await safeJson(response)) as XcmAuthLoginResponse;
    if (!response.ok || payload.ok !== true) {
      return {
        success: false,
        message: payload.message || 'Login failed.',
      };
    }

    if (payload.data?.twofa_required === true) {
      return {
        success: false,
        message: '2FA is disabled for editor login at the moment. Please disable 2FA for this user.',
      };
    }

    return { success: true, message: 'Authenticated.' };
  } catch (_error) {
    return {
      success: false,
      message: 'xcm_auth is unavailable. Falling back to admin login.',
      unavailable: true,
    };
  }
}

function persistRememberState(input: { rememberMe: boolean; username: string; mode: LoginMode }): void {
  if (!input.rememberMe) {
    localStorage.removeItem(REMEMBER_ME_KEY);
    localStorage.removeItem(REMEMBER_USERNAME_KEY);
    localStorage.removeItem(REMEMBER_MODE_KEY);
    return;
  }

  localStorage.setItem(REMEMBER_ME_KEY, '1');
  localStorage.setItem(REMEMBER_USERNAME_KEY, input.username);
  localStorage.setItem(REMEMBER_MODE_KEY, input.mode);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (_error) {
    return {};
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
