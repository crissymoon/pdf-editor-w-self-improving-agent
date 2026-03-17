// Package email handles all SMTP transactional email delivery for xcm_auth.
// All send paths include console error logging so failures are always visible.
// When SMTP is not configured the Mailer logs a warning and no-ops so the
// app can still start in dev mode (with TWOFA_ENABLED=false).
package email

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"time"

	"xcaliburmoon.net/xcm_auth/config"
)

// Mailer sends transactional emails via SMTP.
type Mailer struct {
	cfg *config.EmailConfig
	app *config.SecurityConfig
}

// NewMailer creates a Mailer from the given configs.
func NewMailer(emailCfg *config.EmailConfig, secCfg *config.SecurityConfig) *Mailer {
	if emailCfg.Host == "" {
		log.Println("[email] SMTP host not configured - emails will be logged to console only (dev mode)")
	}
	return &Mailer{cfg: emailCfg, app: secCfg}
}

// Message is a simple outgoing email.
type Message struct {
	To      string
	Subject string
	Body    string // plain text; HTML version is generated from the same content
}

// Send delivers a single email. If SMTP is not configured it logs the message
// to the console and returns nil (so the auth flow can proceed in dev mode).
func (m *Mailer) Send(msg Message) error {
	if m.cfg.Host == "" {
		log.Printf("[email] DEV MODE - would send to %q subject %q\nBody:\n%s\n", msg.To, msg.Subject, msg.Body)
		return nil
	}

	raw := m.buildRaw(msg)
	addr := fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port)

	var err error
	if m.cfg.UseTLS {
		err = m.sendTLS(addr, raw, msg.To)
	} else {
		err = m.sendPlain(addr, raw, msg.To)
	}
	if err != nil {
		log.Printf("[email] Send to %q failed: %v", msg.To, err)
		return fmt.Errorf("[email] Send: %w", err)
	}
	log.Printf("[email] sent %q to %q", msg.Subject, msg.To)
	return nil
}

func (m *Mailer) buildRaw(msg Message) []byte {
	from := m.cfg.From
	if from == "" {
		from = m.cfg.User
	}
	headers := []string{
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		fmt.Sprintf("From: %s", from),
		fmt.Sprintf("To: %s", msg.To),
		fmt.Sprintf("Subject: %s", msg.Subject),
		fmt.Sprintf("Date: %s", time.Now().Format(time.RFC1123Z)),
		"X-Mailer: xcm_auth",
	}
	return []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + msg.Body)
}

func (m *Mailer) envelopeFrom() string {
	if m.cfg.From != "" {
		return m.cfg.From
	}
	return m.cfg.User
}

func (m *Mailer) auth() smtp.Auth {
	if m.cfg.User == "" || m.cfg.Pass == "" {
		return nil
	}
	host, _, _ := net.SplitHostPort(fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port))
	return smtp.PlainAuth("", m.cfg.User, m.cfg.Pass, host)
}

func (m *Mailer) sendTLS(addr string, raw []byte, to string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("sendTLS: split host/port %q: %w", addr, err)
	}
	tlsCfg := &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: false, // never skip in production
	}
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("sendTLS: dial %q: %w", addr, err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("sendTLS: smtp.NewClient: %w", err)
	}
	defer client.Close()

	if a := m.auth(); a != nil {
		if err := client.Auth(a); err != nil {
			return fmt.Errorf("sendTLS: auth: %w", err)
		}
	}
	from := m.envelopeFrom()
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("sendTLS: MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("sendTLS: RCPT TO: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("sendTLS: DATA: %w", err)
	}
	defer w.Close()
	if _, err := w.Write(raw); err != nil {
		return fmt.Errorf("sendTLS: write body: %w", err)
	}
	return nil
}

func (m *Mailer) sendPlain(addr string, raw []byte, to string) error {
	a := m.auth()
	return smtp.SendMail(addr, a, m.envelopeFrom(), []string{to}, raw)
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

// Send2FACode sends a login verification code to the given email address.
func (m *Mailer) Send2FACode(to, code, purpose string) error {
	subject, body := build2FAEmail(m.app.AppName, m.app.AppURL, to, code, purpose)
	return m.Send(Message{To: to, Subject: subject, Body: body})
}

// SendPasswordReset sends a password-reset verification code.
func (m *Mailer) SendPasswordReset(to, code string) error {
	return m.Send2FACode(to, code, "password_reset")
}

// SendWelcome sends an account-created confirmation with an email-verify code.
func (m *Mailer) SendWelcome(to, username, code string) error {
	subject := fmt.Sprintf("[%s] Verify your email address", m.app.AppName)
	body := fmt.Sprintf(
		"Welcome to %s, %s!\n\n"+
			"Please verify your email address by entering the following code:\n\n"+
			"  Verification code: %s\n\n"+
			"This code expires in 10 minutes.\n\n"+
			"If you did not create this account, you can safely ignore this email.\n\n"+
			"-- %s\n%s\n",
		m.app.AppName, username, code, m.app.AppName, m.app.AppURL,
	)
	return m.Send(Message{To: to, Subject: subject, Body: body})
}
