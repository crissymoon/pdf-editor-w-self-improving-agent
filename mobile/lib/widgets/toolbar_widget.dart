import 'package:flutter/material.dart';
import '../models/annotation.dart';

class ToolbarWidget extends StatelessWidget {
  final AnnotationType activeTool;
  final ValueChanged<AnnotationType> onToolSelected;

  const ToolbarWidget({
    super.key,
    required this.activeTool,
    required this.onToolSelected,
  });

  static const _tools = <(AnnotationType, IconData, String)>[
    (AnnotationType.text, Icons.text_fields, 'Text'),
    (AnnotationType.highlight, Icons.highlight, 'Highlight'),
    (AnnotationType.drawing, Icons.draw, 'Draw'),
    (AnnotationType.checkbox, Icons.check_box_outlined, 'Checkbox'),
    (AnnotationType.date, Icons.calendar_today, 'Date'),
    (AnnotationType.signature, Icons.gesture, 'Sign'),
  ];

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      height: 48,
      color: colorScheme.surfaceContainerHighest,
      child: Row(
        children: _tools.map((entry) {
          final (type, icon, label) = entry;
          final active = type == activeTool;
          return Expanded(
            child: Tooltip(
              message: label,
              child: InkWell(
                onTap: () => onToolSelected(type),
                child: Container(
                  decoration: active
                      ? BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: colorScheme.primary,
                              width: 2,
                            ),
                          ),
                        )
                      : null,
                  child: Icon(
                    icon,
                    size: 22,
                    color: active ? colorScheme.primary : colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
