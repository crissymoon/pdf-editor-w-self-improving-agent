// Mirrors the JSON shape returned by xcm_auth:
//   GET /user/me       -> User
//   GET /user/sessions -> List<UserSession>
//   GET /user/devices  -> List<UserDevice>

class User {
  final String id;
  final String email;
  final String? name;
  final bool emailVerified;
  final bool twoFactorEnabled;
  final DateTime createdAt;

  const User({
    required this.id,
    required this.email,
    this.name,
    required this.emailVerified,
    required this.twoFactorEnabled,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'].toString(),
      email: json['email'] as String,
      name: json['name'] as String?,
      emailVerified: json['email_verified'] as bool? ?? false,
      twoFactorEnabled: json['two_factor_enabled'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

class UserSession {
  final String id;
  final String deviceInfo;
  final DateTime createdAt;
  final DateTime lastSeen;
  final bool current;

  const UserSession({
    required this.id,
    required this.deviceInfo,
    required this.createdAt,
    required this.lastSeen,
    required this.current,
  });

  factory UserSession.fromJson(Map<String, dynamic> json) {
    return UserSession(
      id: json['id'].toString(),
      deviceInfo: json['device_info']?.toString() ?? '',
      createdAt: DateTime.parse(json['created_at'] as String),
      lastSeen: DateTime.parse(json['last_seen'] as String),
      current: json['current'] as bool? ?? false,
    );
  }
}

class UserDevice {
  final String id;
  final String name;
  final String platform;
  final DateTime lastSeen;

  const UserDevice({
    required this.id,
    required this.name,
    required this.platform,
    required this.lastSeen,
  });

  factory UserDevice.fromJson(Map<String, dynamic> json) {
    return UserDevice(
      id: json['id'].toString(),
      name: json['name']?.toString() ?? '',
      platform: json['platform']?.toString() ?? '',
      lastSeen: DateTime.parse(json['last_seen'] as String),
    );
  }
}
