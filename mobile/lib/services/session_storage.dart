import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

/// Thin wrapper around FlutterSecureStorage that reads/writes the two JWT
/// token keys defined in AppConfig.
class SessionStorage {
  SessionStorage._();
  static final SessionStorage instance = SessionStorage._();

  final _store = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  Future<String?> readAccessToken() =>
      _store.read(key: AppConfig.tokenKey);

  Future<String?> readRefreshToken() =>
      _store.read(key: AppConfig.refreshTokenKey);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _store.write(key: AppConfig.tokenKey, value: accessToken);
    await _store.write(key: AppConfig.refreshTokenKey, value: refreshToken);
  }

  Future<void> clearTokens() async {
    await _store.delete(key: AppConfig.tokenKey);
    await _store.delete(key: AppConfig.refreshTokenKey);
  }
}
