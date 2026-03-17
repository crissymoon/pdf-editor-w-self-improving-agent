// Package smoke_test contains advanced security, correctness, performance, and
// memory tests for xcm_auth. Tests run against pure library functions except
// where an in-memory SQLite store is needed for integration cases.
//
// Run all tests and benchmarks:
//   cd xcm_auth && go test ./smoke/... -v -bench=. -benchmem -race -timeout 120s
//
// Run only security tests:
//   go test ./smoke/... -v -run TestSecurity
//
// Run only benchmarks:
//   go test ./smoke/... -bench=. -benchmem -benchtime=3s
package smoke_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"xcaliburmoon.net/xcm_auth/auth"
	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/db"
	"xcaliburmoon.net/xcm_auth/models"
)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

func testJWTCfg() *config.JWTConfig {
	return &config.JWTConfig{
		AccessSecret:        "smoke-test-access-secret-32-bytes!!",
		RefreshSecret:       "smoke-test-refresh-secret-32bytes!",
		AccessExpiryMinutes: 15,
		RefreshExpiryDays:   7,
	}
}

func testTwoFACfg() *config.TwoFAConfig {
	return &config.TwoFAConfig{
		Enabled:       true,
		CodeLength:    6,
		ExpiryMinutes: 10,
		MaxAttempts:   3,
	}
}

func testRateCfg() *config.RateConfig {
	return &config.RateConfig{
		IPLoginMax:                5,
		IPLoginWindowMinutes:      15,
		AccountLoginMax:           5,
		AccountLoginWindowMinutes: 15,
		BlockDurationMinutes:      30,
	}
}

func testUser(id int64) *models.User {
	return &models.User{
		ID:       id,
		Username: "smoketest",
		Email:    "smoke@xcaliburmoon.net",
		Role:     models.RoleUser,
	}
}

// openMemStore returns a fully migrated in-memory SQLite store for integration tests.
func openMemStore(t *testing.T) db.Store {
	t.Helper()
	// modernc.org/sqlite supports file::memory: URIs
	store, err := db.OpenSQLite("file::memory:?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("openMemStore: open: %v", err)
	}
	if err := store.Migrate(context.Background()); err != nil {
		store.Close()
		t.Fatalf("openMemStore: migrate: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

// buildNoneAlgJWT crafts a JWT with alg=none and an elevated role payload.
// Used to verify that ParseAccessToken rejects algorithm substitution attacks.
func buildNoneAlgJWT(userID int64, role string) string {
	header  := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(
		`{"uid":%d,"usr":"attacker","eml":"","role":"%s","sub":"%d","iat":%d,"exp":%d}`,
		userID, role, userID,
		time.Now().Unix(),
		time.Now().Add(1*time.Hour).Unix(),
	)))
	// Signature-less: "header.payload."
	return header + "." + payload + "."
}

// buildRS256AlgJWT crafts a JWT that claims to use RS256 signed with HMAC key.
// Used for algorithm confusion (RS256 vs HS256) detection tests.
func buildRS256AlgJWT(userID int64) string {
	header  := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(
		`{"uid":%d,"usr":"attacker","eml":"","role":"admin","sub":"%d","iat":%d,"exp":%d}`,
		userID, userID,
		time.Now().Unix(),
		time.Now().Add(1*time.Hour).Unix(),
	)))
	fakeSig := base64.RawURLEncoding.EncodeToString([]byte("fake-rsa-sig"))
	return header + "." + payload + "." + fakeSig
}

// tamperPayload base64-decodes the payload of a JWT, modifies the role, and
// re-encodes it, leaving the original signature intact.
func tamperPayload(token, newRole string) string {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return token
	}
	raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
	var m map[string]interface{}
	_ = json.Unmarshal(raw, &m)
	m["role"] = newRole
	newPayload, _ := json.Marshal(m)
	parts[1] = base64.RawURLEncoding.EncodeToString(newPayload)
	return strings.Join(parts, ".")
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: JWT
// ─────────────────────────────────────────────────────────────────────────────

func TestSecurityJWT_ValidRoundTrip(t *testing.T) {
	cfg := testJWTCfg()
	u   := testUser(1)
	token, exp, err := auth.IssueAccessToken(u, cfg)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if exp.Before(time.Now()) {
		t.Fatal("expected expiry in the future")
	}
	claims, err := auth.ParseAccessToken(token, cfg)
	if err != nil {
		t.Fatalf("ParseAccessToken: %v", err)
	}
	if claims.UserID != u.ID {
		t.Errorf("claims.UserID = %d, want %d", claims.UserID, u.ID)
	}
	if claims.Role != u.Role {
		t.Errorf("claims.Role = %q, want %q", claims.Role, u.Role)
	}
}

func TestSecurityJWT_WrongSecret(t *testing.T) {
	cfg1 := testJWTCfg()
	cfg2 := &config.JWTConfig{AccessSecret: "completely-different-secret-32b!!", AccessExpiryMinutes: 15}
	token, _, err := auth.IssueAccessToken(testUser(1), cfg1)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	_, err = auth.ParseAccessToken(token, cfg2)
	if err == nil {
		t.Fatal("ParseAccessToken with wrong secret must fail -- got nil error")
	}
}

func TestSecurityJWT_AlgorithmNone(t *testing.T) {
	cfg   := testJWTCfg()
	token := buildNoneAlgJWT(999, "admin")
	_, err := auth.ParseAccessToken(token, cfg)
	if err == nil {
		t.Fatal("ParseAccessToken must reject alg=none tokens")
	}
}

func TestSecurityJWT_AlgorithmSubstitutionRS256(t *testing.T) {
	cfg   := testJWTCfg()
	token := buildRS256AlgJWT(999)
	_, err := auth.ParseAccessToken(token, cfg)
	if err == nil {
		t.Fatal("ParseAccessToken must reject RS256 algorithm substitution")
	}
}

func TestSecurityJWT_TamperedPayload(t *testing.T) {
	cfg := testJWTCfg()
	u   := &models.User{ID: 1, Username: "user", Email: "u@test.com", Role: models.RoleUser}
	token, _, err := auth.IssueAccessToken(u, cfg)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	forged := tamperPayload(token, models.RoleAdmin)
	_, err = auth.ParseAccessToken(forged, cfg)
	if err == nil {
		t.Fatal("ParseAccessToken must reject tampered payload -- signature mismatch")
	}
}

func TestSecurityJWT_EmptyString(t *testing.T) {
	cfg := testJWTCfg()
	_, err := auth.ParseAccessToken("", cfg)
	if err == nil {
		t.Fatal("ParseAccessToken must reject empty string")
	}
}

func TestSecurityJWT_MalformedToken(t *testing.T) {
	cfg      := testJWTCfg()
	garbage  := []string{
		"not.a.jwt",
		"aGVhZGVy.cGF5bG9hZA==",          // only 2 parts
		"a.b.c.d",                          // 4 parts
		strings.Repeat("x", 2048),          // very long non-token
		"eyJhbGciOiJIUzI1NiJ9.e30.",        // valid header, empty payload, no sig
	}
	for _, tok := range garbage {
		if _, err := auth.ParseAccessToken(tok, cfg); err == nil {
			t.Errorf("ParseAccessToken(%q) must fail", tok)
		}
	}
}

func TestSecurityJWT_ExpiredToken(t *testing.T) {
	cfg := &config.JWTConfig{
		AccessSecret:        testJWTCfg().AccessSecret,
		AccessExpiryMinutes: -1, // already expired
	}
	token, _, err := auth.IssueAccessToken(testUser(1), cfg)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	_, err = auth.ParseAccessToken(token, cfg)
	if err == nil {
		t.Fatal("ParseAccessToken must reject expired tokens")
	}
}

func TestSecurityJWT_NilUserRejected(t *testing.T) {
	cfg := testJWTCfg()
	_, _, err := auth.IssueAccessToken(nil, cfg)
	if err == nil {
		t.Fatal("IssueAccessToken(nil) must return an error")
	}
}

func TestSecurityJWT_RoleBoundary(t *testing.T) {
	cfg := testJWTCfg()
	for _, role := range []string{models.RoleUser, models.RoleAdmin} {
		u := &models.User{ID: 10, Username: "roletest", Email: "r@test.com", Role: role}
		token, _, err := auth.IssueAccessToken(u, cfg)
		if err != nil {
			t.Fatalf("IssueAccessToken role=%q: %v", role, err)
		}
		claims, err := auth.ParseAccessToken(token, cfg)
		if err != nil {
			t.Fatalf("ParseAccessToken role=%q: %v", role, err)
		}
		if claims.Role != role {
			t.Errorf("role round-trip failed: got %q, want %q", claims.Role, role)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: Refresh Tokens
// ─────────────────────────────────────────────────────────────────────────────

func TestSecurityRefreshToken_Uniqueness(t *testing.T) {
	const n    = 2000
	seen       := make(map[string]bool, n)
	for i := 0; i < n; i++ {
		raw, _, err := auth.GenerateRefreshToken()
		if err != nil {
			t.Fatalf("GenerateRefreshToken [%d]: %v", i, err)
		}
		if seen[raw] {
			t.Fatalf("duplicate refresh token at iteration %d", i)
		}
		seen[raw] = true
	}
}

func TestSecurityRefreshToken_HashConsistency(t *testing.T) {
	raw, storedHash, err := auth.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}
	recomputed := auth.HashRefreshToken(raw)
	if recomputed != storedHash {
		t.Errorf("hash mismatch: stored=%q recomputed=%q", storedHash, recomputed)
	}
}

func TestSecurityRefreshToken_HashDifferentFromRaw(t *testing.T) {
	raw, hash, err := auth.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}
	if raw == hash {
		t.Fatal("raw token must not equal its hash")
	}
}

func TestSecurityRefreshToken_DifferentRawSameHash(t *testing.T) {
	raw1, _, _ := auth.GenerateRefreshToken()
	raw2, _, _ := auth.GenerateRefreshToken()
	if auth.HashRefreshToken(raw1) == auth.HashRefreshToken(raw2) {
		t.Fatal("different raw tokens must not produce the same hash")
	}
}

func TestSecurityRefreshToken_MinEntropy(t *testing.T) {
	// Raw token is hex-encoded 48 bytes = 96 hex chars.
	raw, _, err := auth.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}
	// Must be at least 64 hex chars (256 bits of entropy minimum)
	if len(raw) < 64 {
		t.Errorf("refresh token too short for adequate entropy: got %d chars, want >= 64", len(raw))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: Password Hashing
// ─────────────────────────────────────────────────────────────────────────────

func TestSecurityPassword_HashAndVerify(t *testing.T) {
	plain := "CorrectHorse$Battery99"
	hash, err := auth.HashPassword(plain, 4)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == plain {
		t.Fatal("hash must not equal plaintext")
	}
	ok, err := auth.CheckPassword(hash, plain)
	if err != nil {
		t.Fatalf("CheckPassword: %v", err)
	}
	if !ok {
		t.Fatal("CheckPassword: expected true for correct password")
	}
}

func TestSecurityPassword_WrongPassword(t *testing.T) {
	hash, _ := auth.HashPassword("CorrectPassword1", 4)
	ok, err := auth.CheckPassword(hash, "WrongPassword1")
	if err != nil {
		t.Fatalf("CheckPassword unexpected error: %v", err)
	}
	if ok {
		t.Fatal("CheckPassword must return false for wrong password")
	}
}

func TestSecurityPassword_HashesAreUnique(t *testing.T) {
	// bcrypt salts ensure the same password never produces the same hash twice
	h1, _ := auth.HashPassword("SamePassword9", 4)
	h2, _ := auth.HashPassword("SamePassword9", 4)
	if h1 == h2 {
		t.Fatal("bcrypt must produce different salts -- two hashes of the same password are identical (no salt?)")
	}
}

func TestSecurityPassword_EmptyInputs(t *testing.T) {
	_, err := auth.HashPassword("", 4)
	if err == nil {
		t.Fatal("HashPassword with empty string must fail")
	}
	_, err = auth.CheckPassword("", "password")
	if err == nil {
		t.Fatal("CheckPassword with empty hash must fail")
	}
	_, err = auth.CheckPassword("$2a$04$validhashvalidsalt12345678901234", "")
	if err == nil {
		t.Fatal("CheckPassword with empty plain must fail")
	}
}

func TestSecurityPassword_TimingConsistency(t *testing.T) {
	// CheckPassword should take roughly the same time for wrong vs non-existent
	// hashes to prevent timing-based user enumeration. We can not assert exact
	// timing in a unit test, but we verify there is no panic or short-circuit
	// on various wrong inputs.
	hash, _ := auth.HashPassword("ValidPass1", 4)
	variants := []struct{ h, p string }{
		{hash, "WrongPass1"},
		{hash, strings.Repeat("x", 72)},    // bcrypt 72-char truncation boundary
		{hash, strings.Repeat("x", 73)},    // past truncation -- should match 72-char
		{hash, "A"},
	}
	for _, v := range variants {
		// Must not panic; result is false or true but never a system error
		_, err := auth.CheckPassword(v.h, v.p)
		if err != nil {
			t.Logf("CheckPassword(%q, %q): %v (non-fatal in timing test)", v.h[:10]+"...", v.p[:1]+"...", err)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: Password Strength
// ─────────────────────────────────────────────────────────────────────────────

func TestSecurityPasswordStrength_ValidPasswords(t *testing.T) {
	valid := []string{
		"Abcdef12",
		"Password1",
		"Xc@liburMoon99!",
		strings.Repeat("A", 4) + strings.Repeat("a", 4) + "1", // exactly 9 chars
	}
	for _, p := range valid {
		if err := auth.PasswordStrength(p); err != nil {
			t.Errorf("PasswordStrength(%q) unexpectedly returned error: %v", p, err)
		}
	}
}

func TestSecurityPasswordStrength_TooShort(t *testing.T) {
	if err := auth.PasswordStrength("Ab1"); err == nil {
		t.Fatal("PasswordStrength must reject 3-char password")
	}
	if err := auth.PasswordStrength("Abcdef1"); err == nil {
		t.Fatal("PasswordStrength must reject 7-char password")
	}
}

func TestSecurityPasswordStrength_MissingRequirements(t *testing.T) {
	cases := []struct {
		pw   string
		desc string
	}{
		{"alllowercase1", "no uppercase"},
		{"ALLUPPERCASE1", "no lowercase"},
		{"AllLettersNoNum", "no digit"},
		{"12345678", "no letters"},
	}
	for _, c := range cases {
		if err := auth.PasswordStrength(c.pw); err == nil {
			t.Errorf("PasswordStrength(%q): expected error for %s", c.pw, c.desc)
		}
	}
}

func TestSecurityPasswordStrength_Boundary(t *testing.T) {
	// Exactly 8 chars, all requirements met
	if err := auth.PasswordStrength("Abcdef12"); err != nil {
		t.Errorf("exactly-8-char password that meets all rules should pass: %v", err)
	}
	// Exactly 7 chars must fail
	if err := auth.PasswordStrength("Abcde12"); err == nil {
		t.Error("7-char password must fail")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: Device Fingerprinting
// ─────────────────────────────────────────────────────────────────────────────

func newReq(ua, lang, enc string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("User-Agent",       ua)
	req.Header.Set("Accept-Language",  lang)
	req.Header.Set("Accept-Encoding",  enc)
	return req
}

func TestSecurityDevice_Determinism(t *testing.T) {
	r1 := newReq("Mozilla/5.0 Chrome/120", "en-US,en;q=0.9", "gzip, deflate, br")
	r2 := newReq("Mozilla/5.0 Chrome/120", "en-US,en;q=0.9", "gzip, deflate, br")
	fp1 := auth.DeviceFingerprint(r1)
	fp2 := auth.DeviceFingerprint(r2)
	if fp1 != fp2 {
		t.Errorf("identical headers must produce identical fingerprint: %q != %q", fp1, fp2)
	}
}

func TestSecurityDevice_Sensitivity(t *testing.T) {
	base := newReq("Mozilla/5.0 Chrome/120", "en-US", "gzip")
	diff := newReq("Mozilla/5.0 Chrome/119", "en-US", "gzip")
	if auth.DeviceFingerprint(base) == auth.DeviceFingerprint(diff) {
		t.Error("different User-Agent must produce different fingerprint")
	}
}

func TestSecurityDevice_LengthAndFormat(t *testing.T) {
	r  := newReq("TestAgent/1.0", "en", "gzip")
	fp := auth.DeviceFingerprint(r)
	// SHA-256 hex = 64 chars
	if len(fp) != 64 {
		t.Errorf("fingerprint must be 64 hex chars, got %d: %q", len(fp), fp)
	}
	for _, c := range fp {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("non-hex character %q in fingerprint %q", c, fp)
		}
	}
}

func TestSecurityDevice_EmptyHeaders(t *testing.T) {
	// Empty headers must not panic and must produce a consistent result
	r1 := httptest.NewRequest(http.MethodGet, "/", nil)
	r2 := httptest.NewRequest(http.MethodGet, "/", nil)
	fp1 := auth.DeviceFingerprint(r1)
	fp2 := auth.DeviceFingerprint(r2)
	if fp1 != fp2 {
		t.Error("empty headers must produce consistent fingerprint")
	}
	if len(fp1) != 64 {
		t.Errorf("empty-header fingerprint must still be 64 hex chars, got %d", len(fp1))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Security: ClientIP extraction
// ─────────────────────────────────────────────────────────────────────────────

func TestSecurityClientIP_XForwardedFor(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
	ip := auth.ClientIP(r)
	if ip != "203.0.113.5" {
		t.Errorf("expected first IP from XFF, got %q", ip)
	}
}

func TestSecurityClientIP_XRealIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("X-Real-Ip", "198.51.100.42")
	ip := auth.ClientIP(r)
	if ip != "198.51.100.42" {
		t.Errorf("X-Real-Ip: expected 198.51.100.42, got %q", ip)
	}
}

func TestSecurityClientIP_RemoteAddr(t *testing.T) {
	r          := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "192.0.2.1:54321"
	ip := auth.ClientIP(r)
	if ip != "192.0.2.1" {
		t.Errorf("RemoteAddr fallback: expected 192.0.2.1, got %q", ip)
	}
}

func TestSecurityClientIP_XFFPriority(t *testing.T) {
	// X-Forwarded-For takes priority over X-Real-Ip
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("X-Forwarded-For", "203.0.113.1")
	r.Header.Set("X-Real-Ip", "198.51.100.1")
	ip := auth.ClientIP(r)
	if ip != "203.0.113.1" {
		t.Errorf("XFF must take priority over X-Real-Ip: got %q", ip)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration: 2FA code lifecycle (in-memory SQLite)
// ─────────────────────────────────────────────────────────────────────────────

func TestIntegration2FA_CorrectCodeVerification(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testTwoFACfg()

	user := &models.User{
		Username: "twofa_user", Email: "twofa@test.com",
		PasswordHash: "x", Role: models.RoleUser, IsActive: true,
	}
	userID, err := store.CreateUser(ctx, user)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	code, err := auth.GenerateTwoFACode(ctx, store, userID, models.PurposeLogin, cfg, 4)
	if err != nil {
		t.Fatalf("GenerateTwoFACode: %v", err)
	}
	if len(code) != cfg.CodeLength {
		t.Errorf("code length: got %d, want %d", len(code), cfg.CodeLength)
	}

	res, err := auth.VerifyTwoFACode(ctx, store, userID, models.PurposeLogin, code, cfg)
	if err != nil {
		t.Fatalf("VerifyTwoFACode: %v", err)
	}
	if !res.OK {
		t.Fatalf("VerifyTwoFACode: expected OK=true, got %+v", res)
	}
}

func TestIntegration2FA_WrongCode(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testTwoFACfg()

	user   := &models.User{Username: "twofa2", Email: "twofa2@test.com", PasswordHash: "x", Role: models.RoleUser, IsActive: true}
	userID, _  := store.CreateUser(ctx, user)

	_, err := auth.GenerateTwoFACode(ctx, store, userID, models.PurposeLogin, cfg, 4)
	if err != nil {
		t.Fatalf("GenerateTwoFACode: %v", err)
	}

	res, err := auth.VerifyTwoFACode(ctx, store, userID, models.PurposeLogin, "000000", cfg)
	if err != nil {
		t.Fatalf("VerifyTwoFACode wrong: %v", err)
	}
	if res.OK {
		t.Fatal("wrong code must return OK=false")
	}
}

func TestIntegration2FA_MaxAttemptsLockout(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testTwoFACfg() // MaxAttempts = 3

	user   := &models.User{Username: "twofa3", Email: "twofa3@test.com", PasswordHash: "x", Role: models.RoleUser, IsActive: true}
	userID, _  := store.CreateUser(ctx, user)

	_, err := auth.GenerateTwoFACode(ctx, store, userID, models.PurposeLogin, cfg, 4)
	if err != nil {
		t.Fatalf("GenerateTwoFACode: %v", err)
	}

	// Exhaust max attempts with wrong codes
	for i := 0; i < cfg.MaxAttempts; i++ {
		res, err := auth.VerifyTwoFACode(ctx, store, userID, models.PurposeLogin, "000000", cfg)
		if err != nil {
			t.Fatalf("VerifyTwoFACode attempt %d: %v", i+1, err)
		}
		if res.MaxAttempts {
			// Locked out - expected at or before the limit
			return
		}
	}
	// One more attempt must be locked out or NotFound (code invalidated)
	res, _ := auth.VerifyTwoFACode(ctx, store, userID, models.PurposeLogin, "000000", cfg)
	if !res.MaxAttempts && !res.NotFound {
		t.Fatal("expected MaxAttempts or NotFound after exhausting attempts")
	}
}

func TestIntegration2FA_EmptySubmittedCode(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testTwoFACfg()

	user   := &models.User{Username: "twofa4", Email: "twofa4@test.com", PasswordHash: "x", Role: models.RoleUser, IsActive: true}
	userID, _  := store.CreateUser(ctx, user)
	_, _        = auth.GenerateTwoFACode(ctx, store, userID, models.PurposeLogin, cfg, 4)

	_, err := auth.VerifyTwoFACode(ctx, store, userID, models.PurposeLogin, "", cfg)
	if err == nil {
		t.Fatal("VerifyTwoFACode with empty code must return an error")
	}
}

func TestIntegration2FA_OnlyOneActiveCodePerPurpose(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testTwoFACfg()

	user   := &models.User{Username: "twofa5", Email: "twofa5@test.com", PasswordHash: "x", Role: models.RoleUser, IsActive: true}
	userID, _  := store.CreateUser(ctx, user)

	// Generate first code then immediately generate a second
	code1, _ := auth.GenerateTwoFACode(ctx, store, userID, models.PurposeLogin, cfg, 4)
	code2, _ := auth.GenerateTwoFACode(ctx, store, userID, models.PurposeLogin, cfg, 4)

	// The first code must now be invalid (invalidated by second generation)
	res1, _ := auth.VerifyTwoFACode(ctx, store, userID, models.PurposeLogin, code1, cfg)
	if res1.OK {
		t.Error("first code must be invalidated after second code is generated")
	}
	// The second code must still work
	// (only if they are numerically different -- very unlikely to collide)
	if code1 != code2 {
		res2, err := auth.VerifyTwoFACode(ctx, store, userID, models.PurposeLogin, code2, cfg)
		if err != nil {
			t.Fatalf("VerifyTwoFACode second code: %v", err)
		}
		if !res2.OK {
			t.Error("second (latest) code must be valid")
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration: Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

func TestIntegrationRateLimit_NotBlockedInitially(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testRateCfg()

	res, err := auth.CheckRateLimit(ctx, store, "ip:192.0.2.1", "login", cfg)
	if err != nil {
		t.Fatalf("CheckRateLimit: %v", err)
	}
	if res.Blocked {
		t.Fatal("new IP must not be blocked initially")
	}
}

func TestIntegrationRateLimit_BlockAfterMaxAttempts(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testRateCfg() // IPLoginMax = 5

	key    := "ip:10.0.0.77"
	action := "login"

	for i := 0; i < cfg.IPLoginMax; i++ {
		if err := auth.RecordAttempt(ctx, store, key, action, cfg); err != nil {
			t.Fatalf("RecordAttempt %d: %v", i+1, err)
		}
	}

	res, err := auth.CheckRateLimit(ctx, store, key, action, cfg)
	if err != nil {
		t.Fatalf("CheckRateLimit after max attempts: %v", err)
	}
	if !res.Blocked {
		t.Fatalf("must be blocked after %d attempts, got Blocked=false", cfg.IPLoginMax)
	}
	if res.BlockedUntil.Before(time.Now()) {
		t.Error("BlockedUntil must be in the future")
	}
}

func TestIntegrationRateLimit_ClearResetsCounter(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testRateCfg()

	key    := "ip:10.0.0.88"
	action := "login"

	for i := 0; i < 3; i++ {
		_ = auth.RecordAttempt(ctx, store, key, action, cfg)
	}
	auth.ClearAttempts(ctx, store, key, action)

	res, err := auth.CheckRateLimit(ctx, store, key, action, cfg)
	if err != nil {
		t.Fatalf("CheckRateLimit after clear: %v", err)
	}
	if res.Blocked {
		t.Fatal("ClearAttempts must unblock the key")
	}
}

func TestIntegrationRateLimit_AccountVsIPSeparation(t *testing.T) {
	store := openMemStore(t)
	ctx   := context.Background()
	cfg   := testRateCfg()

	ipKey      := "ip:10.0.0.99"
	accountKey := "user:42"

	// Exhaust IP limit
	for i := 0; i < cfg.IPLoginMax; i++ {
		_ = auth.RecordAttempt(ctx, store, ipKey, "login", cfg)
	}
	ipRes, _ := auth.CheckRateLimit(ctx, store, ipKey, "login", cfg)
	if !ipRes.Blocked {
		t.Fatal("IP key must be blocked")
	}

	// Account key must be independent and not blocked
	accRes, _ := auth.CheckRateLimit(ctx, store, accountKey, "login_account", cfg)
	if accRes.Blocked {
		t.Fatal("account key must not be blocked when IP key is blocked")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration: Session store round-trip
// ─────────────────────────────────────────────────────────────────────────────

func TestIntegrationSession_CreateAndRevoke(t *testing.T) {
	store    := openMemStore(t)
	ctx      := context.Background()

	user     := &models.User{Username: "sess1", Email: "sess1@test.com", PasswordHash: "x", Role: models.RoleUser, IsActive: true}
	userID, _ := store.CreateUser(ctx, user)

	raw, hash, err := auth.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}
	_ = raw // client keeps raw; server stores hash

	sess := &models.Session{
		UserID:           userID,
		RefreshTokenHash: hash,
		IPAddress:        "127.0.0.1",
		UserAgent:        "smoke-test",
		ExpiresAt:        auth.RefreshExpiresAt(testJWTCfg()),
	}
	sessID, err := store.CreateSession(ctx, sess)
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	// Lookup by hash
	found, err := store.GetSessionByTokenHash(ctx, hash)
	if err != nil {
		t.Fatalf("GetSessionByTokenHash: %v", err)
	}
	if found == nil || found.ID != sessID {
		t.Fatalf("session not found by token hash")
	}
	if found.Revoked {
		t.Fatal("newly created session must not be revoked")
	}

	// Revoke
	if err := store.RevokeSession(ctx, sessID, "smoke-test-logout"); err != nil {
		t.Fatalf("RevokeSession: %v", err)
	}
	revoked, _ := store.GetSessionByID(ctx, sessID)
	if revoked == nil || !revoked.Revoked {
		t.Fatal("session must be marked revoked after RevokeSession")
	}
}

func TestIntegrationSession_RevokeAllUserSessions(t *testing.T) {
	store      := openMemStore(t)
	ctx        := context.Background()

	user       := &models.User{Username: "sess2", Email: "sess2@test.com", PasswordHash: "x", Role: models.RoleUser, IsActive: true}
	userID, _  := store.CreateUser(ctx, user)

	for i := 0; i < 4; i++ {
		_, hash, _ := auth.GenerateRefreshToken()
		sess := &models.Session{
			UserID:           userID,
			RefreshTokenHash: hash,
			IPAddress:        "127.0.0.1",
			ExpiresAt:        auth.RefreshExpiresAt(testJWTCfg()),
		}
		_, _ = store.CreateSession(ctx, sess)
	}

	if err := store.RevokeAllUserSessions(ctx, userID, "security-event"); err != nil {
		t.Fatalf("RevokeAllUserSessions: %v", err)
	}
	sessions, err := store.ListSessionsByUser(ctx, userID)
	if err != nil {
		t.Fatalf("ListSessionsByUser: %v", err)
	}
	for _, s := range sessions {
		if !s.Revoked {
			t.Errorf("session %d must be revoked", s.ID)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency: parallel token issuance
// ─────────────────────────────────────────────────────────────────────────────

func TestConcurrency_ParallelTokenIssuance(t *testing.T) {
	cfg := testJWTCfg()
	var wg sync.WaitGroup
	errs := make(chan error, 200)

	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func(id int64) {
			defer wg.Done()
			token, _, err := auth.IssueAccessToken(testUser(id), cfg)
			if err != nil {
				errs <- fmt.Errorf("goroutine %d IssueAccessToken: %w", id, err)
				return
			}
			claims, err := auth.ParseAccessToken(token, cfg)
			if err != nil {
				errs <- fmt.Errorf("goroutine %d ParseAccessToken: %w", id, err)
				return
			}
			if claims.UserID != id {
				errs <- fmt.Errorf("goroutine %d: claims.UserID=%d want %d", id, claims.UserID, id)
			}
		}(int64(i))
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
}

func TestConcurrency_ParallelRefreshTokenGeneration(t *testing.T) {
	const n    = 500
	tokens     := make([]string, n)
	var wg      sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			raw, _, _ := auth.GenerateRefreshToken()
			tokens[idx] = raw
		}(i)
	}
	wg.Wait()
	seen := make(map[string]bool, n)
	for _, tok := range tokens {
		if seen[tok] {
			t.Fatal("duplicate refresh token in concurrent generation")
		}
		seen[tok] = true
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance benchmarks
// ─────────────────────────────────────────────────────────────────────────────

func BenchmarkHashPassword_Cost4(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = auth.HashPassword("BenchmarkPass1", 4)
	}
}

func BenchmarkHashPassword_Cost10(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = auth.HashPassword("BenchmarkPass1", 10)
	}
}

func BenchmarkHashPassword_Cost12(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = auth.HashPassword("BenchmarkPass1", 12)
	}
}

func BenchmarkCheckPassword(b *testing.B) {
	hash, _ := auth.HashPassword("BenchmarkPass1", 4)
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = auth.CheckPassword(hash, "BenchmarkPass1")
	}
}

func BenchmarkIssueAccessToken(b *testing.B) {
	cfg := testJWTCfg()
	u   := testUser(1)
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _, _ = auth.IssueAccessToken(u, cfg)
	}
}

func BenchmarkParseAccessToken(b *testing.B) {
	cfg   := testJWTCfg()
	token, _, _ := auth.IssueAccessToken(testUser(1), cfg)
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = auth.ParseAccessToken(token, cfg)
	}
}

func BenchmarkGenerateRefreshToken(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _, _ = auth.GenerateRefreshToken()
	}
}

func BenchmarkHashRefreshToken(b *testing.B) {
	raw, _, _ := auth.GenerateRefreshToken()
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = auth.HashRefreshToken(raw)
	}
}

func BenchmarkDeviceFingerprint(b *testing.B) {
	r := newReq("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36", "en-US,en;q=0.9", "gzip, deflate, br")
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = auth.DeviceFingerprint(r)
	}
}

func BenchmarkPasswordStrength_Pass(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = auth.PasswordStrength("ValidPass9!")
	}
}

func BenchmarkPasswordStrength_Fail(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = auth.PasswordStrength("short")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory allocation checks
// ─────────────────────────────────────────────────────────────────────────────

func TestMemory_ParseAccessToken_AllocsStable(t *testing.T) {
	cfg   := testJWTCfg()
	token, _, _ := auth.IssueAccessToken(testUser(1), cfg)

	allocs := testing.AllocsPerRun(50, func() {
		_, _ = auth.ParseAccessToken(token, cfg)
	})
	// ParseAccessToken should not allocate excessively on the hot path.
	// Threshold (< 60) accounts for JWT library claim parsing internals.
	if allocs > 60 {
		t.Errorf("ParseAccessToken allocs per run = %.1f, want <= 60", allocs)
	}
	t.Logf("ParseAccessToken allocs per run: %.1f", allocs)
}

func TestMemory_HashRefreshToken_LowAllocs(t *testing.T) {
	raw, _, _ := auth.GenerateRefreshToken()

	allocs := testing.AllocsPerRun(100, func() {
		_ = auth.HashRefreshToken(raw)
	})
	// SHA-256 hash should be < 5 allocations
	if allocs > 5 {
		t.Errorf("HashRefreshToken allocs per run = %.1f, want <= 5", allocs)
	}
	t.Logf("HashRefreshToken allocs per run: %.1f", allocs)
}

func TestMemory_DeviceFingerprint_LowAllocs(t *testing.T) {
	r := newReq("Mozilla/5.0", "en", "gzip")

	allocs := testing.AllocsPerRun(100, func() {
		_ = auth.DeviceFingerprint(r)
	})
	if allocs > 15 {
		t.Errorf("DeviceFingerprint allocs per run = %.1f, want <= 15", allocs)
	}
	t.Logf("DeviceFingerprint allocs per run: %.1f", allocs)
}

func TestMemory_PasswordStrength_ZeroAllocs(t *testing.T) {
	allocs := testing.AllocsPerRun(200, func() {
		_ = auth.PasswordStrength("ValidPass1!")
	})
	if allocs > 3 {
		t.Errorf("PasswordStrength allocs per run = %.1f, want <= 3", allocs)
	}
	t.Logf("PasswordStrength allocs per run: %.1f", allocs)
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced: heap pressure under concurrent load
// ─────────────────────────────────────────────────────────────────────────────

func TestMemory_ConcurrentTokenIssuanceGCPressure(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping GC pressure test in short mode")
	}
	cfg := testJWTCfg()
	u   := testUser(1)

	var statsBefore, statsAfter runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&statsBefore)

	var wg sync.WaitGroup
	const goroutines = 50
	const batchSize  = 100
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < batchSize; i++ {
				token, _, _ := auth.IssueAccessToken(u, cfg)
				_, _         = auth.ParseAccessToken(token, cfg)
			}
		}()
	}
	wg.Wait()

	runtime.GC()
	runtime.ReadMemStats(&statsAfter)

	// HeapInuse should not have grown by more than 20 MB from token operations alone
	growthMB := float64(statsAfter.HeapInuse-statsBefore.HeapInuse) / (1024 * 1024)
	t.Logf("HeapInuse growth: %.2f MB over %d token issue+parse operations", growthMB, goroutines*batchSize)
	if growthMB > 20 {
		t.Errorf("unexpected heap growth: %.2f MB (threshold 20 MB)", growthMB)
	}
}
