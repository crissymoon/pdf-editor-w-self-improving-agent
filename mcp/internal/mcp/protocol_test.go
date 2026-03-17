package mcp

import (
	"bufio"
	"bytes"
	"testing"
)

func TestFrameRoundTrip(t *testing.T) {
	t.Parallel()

	payload := []byte(`{"jsonrpc":"2.0","method":"ping"}`)
	buffer := bytes.NewBuffer(nil)

	if err := WriteFrame(buffer, payload); err != nil {
		t.Fatalf("write frame: %v", err)
	}

	decoded, err := ReadFrame(bufio.NewReader(bytes.NewReader(buffer.Bytes())))
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}

	if string(decoded) != string(payload) {
		t.Fatalf("decoded payload mismatch: got %s", string(decoded))
	}
}
