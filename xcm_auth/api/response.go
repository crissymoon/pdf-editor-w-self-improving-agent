// Package api wires the HTTP server, routing, middleware, and request handlers.
package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// ── JSON response helpers ──────────────────────────────────────────────────────

type response struct {
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
	Data    any    `json:"data,omitempty"`
	Errors  []string `json:"errors,omitempty"`
}

// jsonOK writes a 200 JSON response.
func jsonOK(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, response{OK: true, Data: data})
}

// jsonCreated writes a 201 JSON response.
func jsonCreated(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusCreated, response{OK: true, Data: data})
}

// jsonMsg writes a 200 plain message response.
func jsonMsg(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusOK, response{OK: true, Message: msg})
}

// jsonErr writes an error JSON response with the given HTTP status code.
func jsonErr(w http.ResponseWriter, status int, msg string) {
	log.Printf("[api/response] HTTP %d: %s", status, msg)
	writeJSON(w, status, response{OK: false, Message: msg})
}

// jsonValidation writes a 422 response with a list of validation errors.
func jsonValidation(w http.ResponseWriter, errs []string) {
	log.Printf("[api/response] 422 validation: %v", errs)
	writeJSON(w, http.StatusUnprocessableEntity, response{OK: false, Errors: errs})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Can't write a new response at this point - just log
		log.Printf("[api/response] writeJSON encode error: %v", err)
	}
}

// decodeJSON reads and decodes a JSON request body into dst.
// Returns a user-readable error string on failure.
func decodeJSON(r *http.Request, dst any) error {
	if r.ContentLength == 0 {
		return fmt.Errorf("request body is empty")
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return fmt.Errorf("invalid JSON: %v", err)
	}
	return nil
}
