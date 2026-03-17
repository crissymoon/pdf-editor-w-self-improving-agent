# xcm_auth smoke

Browser and CLI smoke helpers for local auth verification.

## Scripts

`smoke_login.ps1`

- Verifies username or email login against a running xcm_auth instance.
- Confirms whether the response issues tokens directly or returns a 2FA challenge.

`run_login_smoke_alt_server.ps1`

- Starts a temporary local xcm_auth server on an alternate port.
- Runs `smoke_login.ps1` against it.

`run_auth_guard_smoke_alt_server.ps1`

- Starts a temporary local xcm_auth server on an alternate port.
- Runs `smoke_auth_guard_login.ps1` against that server.
- Optional `-EnablePromptGuard` lets you smoke test with prompt_inj_guard add-on settings.

`smoke_email_2fa.ps1`

- End-to-end local email 2FA smoke runner.
- Starts or reuses the local inbox service at `http://127.0.0.1:8025`.
- Starts or reuses xcm_auth at `http://127.0.0.1:9110`.
- Clears the inbox, logs in, captures the emailed verification code, and submits it to `/auth/verify-2fa`.
- Includes negative checks by default for wrong-code rejection and code-reuse rejection.
- Tracks pass/fail counts and prints a structured summary with elapsed time.
- `-CI`: emits a `##[section]` summary line compatible with CI pipelines.
- `-ResetAfter`: automatically clears runtime DB tables after the run.
- Stops any services it started itself before exiting.

`smoke_auth_guard_login.ps1`

- Login-focused smoke for auth and optional prompt guard add-on behavior.
- Verifies `/health`, register/bootstrap, login, and authenticated `/user/me` access when tokens are available.
- Includes cybersecurity probes for injection-like identifier input and oversized payload handling.
- Optional `-ExpectGuardBlock` check validates block-mode behavior when prompt guard is enabled.
- Prints a compact pass/fail summary plus potential security concerns discovered during the run.

`reset_dev_state.ps1`

- Clears runtime state from the local sqlite dev database.
- Removes smoke-created sessions, devices, 2FA records, audit entries, IP records, and rate-limit rows.
- Leaves users and credentials intact.

## Usage

From `page-builder/xcm_auth`:

```powershell
./smoke/smoke_email_2fa.ps1
```

Run the auth + security probe smoke:

```powershell
./smoke/smoke_auth_guard_login.ps1
```

Expect prompt guard block mode behavior:

```powershell
./smoke/smoke_auth_guard_login.ps1 -ExpectGuardBlock
```

Skip negative checks if you only want the happy path:

```powershell
./smoke/smoke_email_2fa.ps1 -SkipNegativeChecks
```

CI mode with automatic post-run DB cleanup:

```powershell
./smoke/smoke_email_2fa.ps1 -CI -ResetAfter
```

Reset local runtime state after smoke runs:

```powershell
./smoke/reset_dev_state.ps1
```

Override URLs or credentials when needed:

```powershell
./smoke/smoke_email_2fa.ps1 -BaseUrl http://127.0.0.1:9111 -InboxUrl http://127.0.0.1:8025 -CredentialsPath ./dev-credentials.json
```

Browser-facing endpoints during a smoke run:

- Inbox viewer (HTML):  open `dev-tools/email_smoke/inbox_viewer.html` in a browser
- Inbox API:            `http://127.0.0.1:8025/messages`
- Auth health:          `http://127.0.0.1:9110/health`

The SMTP listener used by `email_smoke` is on `127.0.0.1:1025`, but it is not a browser UI.

## VS Code Tasks

- `xcm_auth: smoke email 2FA` -- interactive run
- `xcm_auth: smoke email 2FA (CI mode + reset)` -- CI mode with automatic DB cleanup after run
- `xcm_auth: reset dev state` -- one-click runtime table wipe
- `email: open inbox viewer` -- open the local email inbox UI