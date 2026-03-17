// Mirrors src/types/index.ts Annotation.
// Keep field names aligned with the web app so the xcm_auth API and any
// future sync endpoints can use the same JSON shape.

enum AnnotationType { text, image, signature, drawing, highlight, checkbox, date }

class AnnotationStyle {
  final double? fontSize;
  final String? fontFamily;
  final String? color;

  const AnnotationStyle({this.fontSize, this.fontFamily, this.color});

  factory AnnotationStyle.fromJson(Map<String, dynamic> json) {
    return AnnotationStyle(
      fontSize: (json['fontSize'] as num?)?.toDouble(),
      fontFamily: json['fontFamily'] as String?,
      color: json['color'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    if (fontSize != null) 'fontSize': fontSize,
    if (fontFamily != null) 'fontFamily': fontFamily,
    if (color != null) 'color': color,
  };
}

class Annotation {
  final String id;
  final AnnotationType type;
  final int pageIndex;
  double x;
  double y;
  double width;
  double height;
  String content; // text / 'checked' / 'unchecked' / base64 image / date string
  final AnnotationStyle? style;

  Annotation({
    required this.id,
    required this.type,
    required this.pageIndex,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    required this.content,
    this.style,
  });

  factory Annotation.fromJson(Map<String, dynamic> json) {
    return Annotation(
      id: json['id'] as String,
      type: AnnotationType.values.firstWhere(
        (e) => e.name == json['type'],
        orElse: () => AnnotationType.text,
      ),
      pageIndex: json['pageIndex'] as int,
      x: (json['x'] as num).toDouble(),
      y: (json['y'] as num).toDouble(),
      width: (json['width'] as num).toDouble(),
      height: (json['height'] as num).toDouble(),
      content: json['content']?.toString() ?? '',
      style: json['style'] != null
          ? AnnotationStyle.fromJson(json['style'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.name,
    'pageIndex': pageIndex,
    'x': x,
    'y': y,
    'width': width,
    'height': height,
    'content': content,
    if (style != null) 'style': style!.toJson(),
  };

  Annotation copyWith({
    double? x,
    double? y,
    double? width,
    double? height,
    String? content,
  }) {
    return Annotation(
      id: id,
      type: type,
      pageIndex: pageIndex,
      x: x ?? this.x,
      y: y ?? this.y,
      width: width ?? this.width,
      height: height ?? this.height,
      content: content ?? this.content,
      style: style,
    );
  }
}
