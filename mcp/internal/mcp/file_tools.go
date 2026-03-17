package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (s *Server) handleFileToolCall(_ context.Context, name string, arguments map[string]any) (any, int, error) {
	if !s.cfg.FileTools.Enabled {
		return nil, -32601, fmt.Errorf("file tools are disabled")
	}

	if len(s.cfg.FileTools.SandboxDirs) == 0 {
		return nil, -32601, fmt.Errorf("file tools enabled but no sandbox directories configured")
	}

	switch name {
	case "file.sandbox":
		return s.fileToolResult(map[string]any{
			"enabled":      true,
			"sandbox_dirs": s.cfg.FileTools.SandboxDirs,
		})
	case "file.list":
		return s.handleFileList(arguments)
	case "file.read":
		return s.handleFileRead(arguments)
	case "file.write":
		return s.handleFileWrite(arguments)
	case "file.mkdir":
		return s.handleFileMkdir(arguments)
	case "file.move":
		return s.handleFileMove(arguments)
	case "file.delete":
		return s.handleFileDelete(arguments)
	default:
		return nil, -32601, fmt.Errorf("tool not found: %s", name)
	}
}

func (s *Server) handleFileList(arguments map[string]any) (any, int, error) {
	target := getString(arguments, "path")
	if target == "" {
		target = "."
	}

	absTarget, err := s.resolveSandboxPath(target)
	if err != nil {
		return nil, -32602, err
	}

	info, err := os.Stat(absTarget)
	if err != nil {
		return nil, -32001, err
	}
	if !info.IsDir() {
		return nil, -32602, fmt.Errorf("path is not a directory: %s", target)
	}

	recursive := getBool(arguments, "recursive", false)
	maxEntries := getInt(arguments, "max_entries", 200)
	if maxEntries < 1 {
		maxEntries = 1
	}
	if maxEntries > 2000 {
		maxEntries = 2000
	}

	type entry struct {
		Path string `json:"path"`
		Type string `json:"type"`
		Size int64  `json:"size,omitempty"`
	}
	entries := make([]entry, 0)

	if recursive {
		walkErr := filepath.WalkDir(absTarget, func(current string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if current == absTarget {
				return nil
			}
			rel, relErr := filepath.Rel(absTarget, current)
			if relErr != nil {
				return relErr
			}
			item := entry{Path: filepath.ToSlash(rel), Type: "file"}
			if d.IsDir() {
				item.Type = "directory"
			} else if stat, statErr := d.Info(); statErr == nil {
				item.Size = stat.Size()
			}
			entries = append(entries, item)
			if len(entries) >= maxEntries {
				return io.EOF
			}
			return nil
		})
		if walkErr != nil && walkErr != io.EOF {
			return nil, -32001, walkErr
		}
	} else {
		dirEntries, readErr := os.ReadDir(absTarget)
		if readErr != nil {
			return nil, -32001, readErr
		}
		for _, d := range dirEntries {
			item := entry{Path: d.Name(), Type: "file"}
			if d.IsDir() {
				item.Type = "directory"
			} else if stat, statErr := d.Info(); statErr == nil {
				item.Size = stat.Size()
			}
			entries = append(entries, item)
			if len(entries) >= maxEntries {
				break
			}
		}
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Path < entries[j].Path
	})

	return s.fileToolResult(map[string]any{
		"path":      filepath.ToSlash(absTarget),
		"recursive": recursive,
		"entries":   entries,
	})
}

func (s *Server) handleFileRead(arguments map[string]any) (any, int, error) {
	target := getString(arguments, "path")
	if target == "" {
		return nil, -32602, fmt.Errorf("path is required")
	}

	absTarget, err := s.resolveSandboxPath(target)
	if err != nil {
		return nil, -32602, err
	}

	maxBytes := getInt(arguments, "max_bytes", s.cfg.FileTools.MaxReadBytes)
	if maxBytes < 1 {
		maxBytes = s.cfg.FileTools.MaxReadBytes
	}

	raw, readErr := os.ReadFile(absTarget)
	if readErr != nil {
		return nil, -32001, readErr
	}

	truncated := false
	if len(raw) > maxBytes {
		raw = raw[:maxBytes]
		truncated = true
	}

	return s.fileToolResult(map[string]any{
		"path":       filepath.ToSlash(absTarget),
		"bytes":      len(raw),
		"truncated":  truncated,
		"max_bytes":  maxBytes,
		"content":    string(raw),
	})
}

func (s *Server) handleFileWrite(arguments map[string]any) (any, int, error) {
	target := getString(arguments, "path")
	if target == "" {
		return nil, -32602, fmt.Errorf("path is required")
	}

	contentRaw, ok := arguments["content"]
	if !ok {
		return nil, -32602, fmt.Errorf("content is required")
	}
	content, ok := contentRaw.(string)
	if !ok {
		return nil, -32602, fmt.Errorf("content must be a string")
	}

	if len(content) > s.cfg.FileTools.MaxWriteBytes {
		return nil, -32602, fmt.Errorf("content exceeds max_write_bytes (%d)", s.cfg.FileTools.MaxWriteBytes)
	}

	absTarget, err := s.resolveSandboxPath(target)
	if err != nil {
		return nil, -32602, err
	}

	appendMode := getBool(arguments, "append", false)
	createDirs := getBool(arguments, "create_dirs", true)
	if createDirs {
		if mkErr := os.MkdirAll(filepath.Dir(absTarget), 0o755); mkErr != nil {
			return nil, -32001, mkErr
		}
	}

	flags := os.O_WRONLY | os.O_CREATE
	if appendMode {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
	}

	file, openErr := os.OpenFile(absTarget, flags, 0o644)
	if openErr != nil {
		return nil, -32001, openErr
	}
	defer file.Close()

	if _, writeErr := file.WriteString(content); writeErr != nil {
		return nil, -32001, writeErr
	}

	return s.fileToolResult(map[string]any{
		"path":    filepath.ToSlash(absTarget),
		"written": len(content),
		"append":  appendMode,
	})
}

func (s *Server) handleFileMkdir(arguments map[string]any) (any, int, error) {
	target := getString(arguments, "path")
	if target == "" {
		return nil, -32602, fmt.Errorf("path is required")
	}

	absTarget, err := s.resolveSandboxPath(target)
	if err != nil {
		return nil, -32602, err
	}

	recursive := getBool(arguments, "recursive", true)
	if recursive {
		err = os.MkdirAll(absTarget, 0o755)
	} else {
		err = os.Mkdir(absTarget, 0o755)
	}
	if err != nil {
		return nil, -32001, err
	}

	return s.fileToolResult(map[string]any{
		"path":      filepath.ToSlash(absTarget),
		"recursive": recursive,
		"created":   true,
	})
}

func (s *Server) handleFileMove(arguments map[string]any) (any, int, error) {
	from := getString(arguments, "from")
	to := getString(arguments, "to")
	if from == "" || to == "" {
		return nil, -32602, fmt.Errorf("from and to are required")
	}

	fromAbs, err := s.resolveSandboxPath(from)
	if err != nil {
		return nil, -32602, err
	}
	toAbs, err := s.resolveSandboxPath(to)
	if err != nil {
		return nil, -32602, err
	}

	if mkErr := os.MkdirAll(filepath.Dir(toAbs), 0o755); mkErr != nil {
		return nil, -32001, mkErr
	}

	if mvErr := os.Rename(fromAbs, toAbs); mvErr != nil {
		return nil, -32001, mvErr
	}

	return s.fileToolResult(map[string]any{
		"from":  filepath.ToSlash(fromAbs),
		"to":    filepath.ToSlash(toAbs),
		"moved": true,
	})
}

func (s *Server) handleFileDelete(arguments map[string]any) (any, int, error) {
	target := getString(arguments, "path")
	if target == "" {
		return nil, -32602, fmt.Errorf("path is required")
	}

	absTarget, err := s.resolveSandboxPath(target)
	if err != nil {
		return nil, -32602, err
	}

	recursive := getBool(arguments, "recursive", false)
	if recursive {
		err = os.RemoveAll(absTarget)
	} else {
		err = os.Remove(absTarget)
	}
	if err != nil {
		return nil, -32001, err
	}

	return s.fileToolResult(map[string]any{
		"path":      filepath.ToSlash(absTarget),
		"deleted":   true,
		"recursive": recursive,
	})
}

func (s *Server) resolveSandboxPath(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", fmt.Errorf("path is required")
	}

	expanded := filepath.Clean(trimmed)
	if !filepath.IsAbs(expanded) {
		cwd, err := os.Getwd()
		if err != nil {
			return "", fmt.Errorf("failed to resolve cwd: %w", err)
		}
		expanded = filepath.Join(cwd, expanded)
	}

	absPath, err := filepath.Abs(expanded)
	if err != nil {
		return "", fmt.Errorf("failed to resolve absolute path: %w", err)
	}

	for _, dir := range s.cfg.FileTools.SandboxDirs {
		if isWithinSandbox(absPath, dir) {
			return absPath, nil
		}
	}

	return "", fmt.Errorf("path is outside configured sandbox dirs")
}

func isWithinSandbox(target string, sandbox string) bool {
	rel, err := filepath.Rel(sandbox, target)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	prefix := ".." + string(filepath.Separator)
	return rel != ".." && !strings.HasPrefix(rel, prefix)
}

func (s *Server) fileToolResult(payload map[string]any) (any, int, error) {
	raw, _ := json.Marshal(payload)
	return map[string]any{
		"content": []map[string]string{{
			"type": "text",
			"text": string(raw),
		}},
	}, 0, nil
}

func getBool(arguments map[string]any, key string, fallback bool) bool {
	value, ok := arguments[key]
	if !ok {
		return fallback
	}
	flag, ok := value.(bool)
	if !ok {
		return fallback
	}
	return flag
}
