import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../models/user.dart';
import 'session_storage.dart';

// Sentinel header name sent by xcm_auth when 2FA is required.
const _kChallengeHeader = 'X-Challenge-Token';

/// Result of a login attempt.
sealed class LoginResult {}

class LoginSuccess extends LoginResult {
  final String accessToken;
  final String refreshToken;
  LoginSuccess({required this.accessToken, required this.refreshToken});
}

class LoginNeeds2FA extends LoginResult {
  final String challengeToken;
  LoginNeeds2FA({required this.challengeToken});
}

class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  late final Dio _dio = _buildDio();

  Dio _buildDio() {
    final dio = Dio(BaseOptions(
      baseUrl: AppConfig.authBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ));

    // Auto-attach Bearer token and refresh on 401.
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (opts, handler) async {
        final token = await SessionStorage.instance.readAccessToken();
        if (token != null) {
          opts.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(opts);
      },
      onError: (err, handler) async {
        if (err.response?.statusCode == 401) {
          final refreshed = await _tryRefresh();
          if (refreshed) {
            // Retry original request with new token.
            final token = await SessionStorage.instance.readAccessToken();
            final opts = err.requestOptions
              ..headers['Authorization'] = 'Bearer $token';
            try {
              final res = await dio.fetch(opts);
              return handler.resolve(res);
            } catch (_) {}
          }
        }
        handler.next(err);
      },
    ));

    return dio;
  }

  // ── Auth endpoints ──────────────────────────────────────────────────────────

  Future<void> register({
    required String email,
    required String password,
    String? name,
  }) async {
    await _dio.post('/auth/register', data: {
      'email': email,
      'password': password,
      // ignore: use_null_aware_elements
      if (name != null) 'name': name,
    });
  }

  Future<LoginResult> login({
    required String email,
    required String password,
  }) async {
    final response = await _dio.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    final body = response.data as Map<String, dynamic>;

    // xcm_auth returns a challengeToken field when 2FA is required.
    final challengeToken = body['challenge_token'] as String?;
    if (challengeToken != null) {
      return LoginNeeds2FA(challengeToken: challengeToken);
    }

    final accessToken = body['access_token'] as String;
    final refreshToken = body['refresh_token'] as String;
    await SessionStorage.instance
        .saveTokens(accessToken: accessToken, refreshToken: refreshToken);
    return LoginSuccess(accessToken: accessToken, refreshToken: refreshToken);
  }

  Future<void> verify2FA({
    required String code,
    required String challengeToken,
  }) async {
    final response = await _dio.post(
      '/auth/verify-2fa',
      data: {'code': code},
      options: Options(headers: {_kChallengeHeader: challengeToken}),
    );
    final body = response.data as Map<String, dynamic>;
    await SessionStorage.instance.saveTokens(
      accessToken: body['access_token'] as String,
      refreshToken: body['refresh_token'] as String,
    );
  }

  Future<void> resend2FA({required String challengeToken}) async {
    await _dio.post(
      '/auth/resend-2fa',
      options: Options(headers: {_kChallengeHeader: challengeToken}),
    );
  }

  Future<void> forgotPassword({required String email}) async {
    await _dio.post('/auth/forgot-password', data: {'email': email});
  }

  Future<void> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    await _dio.post('/auth/reset-password', data: {
      'token': token,
      'password': newPassword,
    });
  }

  Future<void> logout() async {
    try {
      await _dio.post('/auth/logout');
    } finally {
      await SessionStorage.instance.clearTokens();
    }
  }

  Future<void> logoutAll() async {
    try {
      await _dio.post('/auth/logout-all');
    } finally {
      await SessionStorage.instance.clearTokens();
    }
  }

  // ── User endpoints ─────────────────────────────────────────────────────────

  Future<User> getMe() async {
    final response = await _dio.get('/user/me');
    return User.fromJson(response.data as Map<String, dynamic>);
  }

  Future<List<UserSession>> getSessions() async {
    final response = await _dio.get('/user/sessions');
    final list = response.data as List<dynamic>;
    return list
        .map((e) => UserSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<UserDevice>> getDevices() async {
    final response = await _dio.get('/user/devices');
    final list = response.data as List<dynamic>;
    return list
        .map((e) => UserDevice.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /// Returns true if a new access token was obtained; false otherwise.
  Future<bool> _tryRefresh() async {
    try {
      final refreshToken = await SessionStorage.instance.readRefreshToken();
      if (refreshToken == null) return false;

      final response = await Dio(BaseOptions(baseUrl: AppConfig.authBaseUrl))
          .post('/auth/refresh', data: {'refresh_token': refreshToken});

      final body = response.data as Map<String, dynamic>;
      await SessionStorage.instance.saveTokens(
        accessToken: body['access_token'] as String,
        refreshToken: body['refresh_token'] as String,
      );
      return true;
    } catch (_) {
      await SessionStorage.instance.clearTokens();
      return false;
    }
  }
}
