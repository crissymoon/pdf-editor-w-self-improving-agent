package mcp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
)

type Request struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      *json.RawMessage `json:"id,omitempty"`
	Method  string           `json:"method"`
	Params  json.RawMessage  `json:"params,omitempty"`
}

type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func ReadFrame(reader *bufio.Reader) ([]byte, error) {
	contentLength := -1
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF && contentLength == -1 {
				return nil, io.EOF
			}
			return nil, err
		}

		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			break
		}

		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "content-length:") {
			raw := strings.TrimSpace(trimmed[len("content-length:"):])
			parsed, parseErr := strconv.Atoi(raw)
			if parseErr != nil || parsed < 0 {
				return nil, fmt.Errorf("invalid Content-Length header")
			}
			contentLength = parsed
		}
	}

	if contentLength < 0 {
		return nil, fmt.Errorf("missing Content-Length header")
	}

	payload := make([]byte, contentLength)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return nil, err
	}

	return payload, nil
}

func WriteFrame(writer io.Writer, payload []byte) error {
	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(payload))
	if _, err := writer.Write([]byte(header)); err != nil {
		return err
	}
	_, err := writer.Write(payload)
	return err
}

func EncodeResponse(response Response) ([]byte, error) {
	buffer := bytes.NewBuffer(nil)
	encoder := json.NewEncoder(buffer)
	if err := encoder.Encode(response); err != nil {
		return nil, err
	}
	return bytes.TrimSpace(buffer.Bytes()), nil
}
