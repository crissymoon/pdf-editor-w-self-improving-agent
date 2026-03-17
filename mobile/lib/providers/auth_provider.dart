import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/session_storage.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus _status = AuthStatus.unknown;
  User? _user;
  String? _errorMessage;

  AuthStatus get status => _status;
  User? get user => _user;
  String? get errorMessage => _errorMessage;
  bool get isLoggedIn => _status == AuthStatus.authenticated;

  /// Called at splash screen to determine whether a valid token is stored.
  Future<void> checkSession() async {
    final token = await SessionStorage.instance.readAccessToken();
    if (token == null) {
      _status = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }
    try {
      _user = await AuthService.instance.getMe();
      _status = AuthStatus.authenticated;
    } catch (_) {
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<LoginResult?> login({
    required String email,
    required String password,
  }) async {
    _errorMessage = null;
    try {
      final result = await AuthService.instance.login(
        email: email,
        password: password,
      );
      if (result is LoginSuccess) {
        _user = await AuthService.instance.getMe();
        _status = AuthStatus.authenticated;
        notifyListeners();
      }
      return result;
    } on Exception catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<bool> verify2FA({
    required String code,
    required String challengeToken,
  }) async {
    _errorMessage = null;
    try {
      await AuthService.instance
          .verify2FA(code: code, challengeToken: challengeToken);
      _user = await AuthService.instance.getMe();
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on Exception catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await AuthService.instance.logout();
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
