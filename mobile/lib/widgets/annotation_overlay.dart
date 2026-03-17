import 'package:flutter/material.dart';
import '../models/annotation.dart';

/// GestureDetector + CustomPaint layer that sits above the PDF renderer.
/// Draws existing annotations and forwards tap events to the caller.
class AnnotationOverlay extends StatelessWidget {
  final List<Annotation> annotations;
  final void Function(Offset offset, Size pageSize)? onTap;

  const AnnotationOverlay({
    super.key,
    required this.annotations,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (_, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        return GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTapUp: (details) => onTap?.call(details.localPosition, size),
          child: CustomPaint(
            size: size,
            painter: _AnnotationPainter(annotations),
          ),
        );
      },
    );
  }
}

class _AnnotationPainter extends CustomPainter {
  final List<Annotation> annotations;

  _AnnotationPainter(this.annotations);

  @override
  void paint(Canvas canvas, Size size) {
    for (final a in annotations) {
      switch (a.type) {
        case AnnotationType.text:
        case AnnotationType.date:
          _drawText(canvas, a);
        case AnnotationType.highlight:
          _drawHighlight(canvas, a);
        case AnnotationType.checkbox:
          _drawCheckbox(canvas, a);
        case AnnotationType.drawing:
          _drawDrawing(canvas, a);
        default:
          _drawPlaceholder(canvas, a);
      }
    }
  }

  void _drawText(Canvas canvas, Annotation a) {
    final tp = TextPainter(
      text: TextSpan(
        text: a.content,
        style: TextStyle(
          fontSize: a.style?.fontSize ?? 14,
          color: _parseColor(a.style?.color) ?? Colors.black87,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: a.width);
    tp.paint(canvas, Offset(a.x, a.y));
  }

  void _drawHighlight(Canvas canvas, Annotation a) {
    final paint = Paint()
      ..color = (_parseColor(a.style?.color) ?? Colors.yellow).withAlpha(100)
      ..style = PaintingStyle.fill;
    canvas.drawRect(Rect.fromLTWH(a.x, a.y, a.width, a.height), paint);
  }

  void _drawCheckbox(Canvas canvas, Annotation a) {
    final paint = Paint()
      ..color = Colors.black87
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final rect = Rect.fromLTWH(a.x, a.y, a.height, a.height); // square
    canvas.drawRect(rect, paint);
    if (a.content == 'checked') {
      final checkPaint = Paint()
        ..color = Colors.black87
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke;
      final path = Path()
        ..moveTo(a.x + 3, a.y + a.height / 2)
        ..lineTo(a.x + a.height * 0.4, a.y + a.height - 4)
        ..lineTo(a.x + a.height - 3, a.y + 4);
      canvas.drawPath(path, checkPaint);
    }
  }

  void _drawDrawing(Canvas canvas, Annotation a) {
    // content encodes JSON point array; leave as placeholder until drawing tool is implemented.
    _drawPlaceholder(canvas, a);
  }

  void _drawPlaceholder(Canvas canvas, Annotation a) {
    final paint = Paint()
      ..color = Colors.blue.withAlpha(60)
      ..style = PaintingStyle.fill;
    canvas.drawRect(Rect.fromLTWH(a.x, a.y, a.width, a.height), paint);
  }

  Color? _parseColor(String? hex) {
    if (hex == null) return null;
    final clean = hex.replaceAll('#', '');
    if (clean.length == 6) {
      return Color(int.parse('FF$clean', radix: 16));
    }
    return null;
  }

  @override
  bool shouldRepaint(_AnnotationPainter old) => old.annotations != annotations;
}
