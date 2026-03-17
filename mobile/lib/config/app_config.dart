// App-wide configuration.
// Set XCM_AUTH_BASE_URL as an --dart-define at build time to point at a
// production xcm_auth server.  Falls back to localhost for development.
//
// Build example:
//   flutter run --dart-define=XCM_AUTH_BASE_URL=https://auth.example.com
//   flutter build apk --dart-define=XCM_AUTH_BASE_URL=https://auth.example.com

class AppConfig {
  AppConfig._();

  // xcm_auth base URL (no trailing slash).
  static const String authBaseUrl = String.fromEnvironment(
    'XCM_AUTH_BASE_URL',
    defaultValue: 'http://10.0.2.2:8080', // Android emulator -> host localhost
  );

  // App display name.
  static const String appName = 'XCM-PDF';

  // JWT access token key stored in secure storage.
  static const String tokenKey = 'xcm_access_token';

  // JWT refresh token key stored in secure storage.
  static const String refreshTokenKey = 'xcm_refresh_token';
}
