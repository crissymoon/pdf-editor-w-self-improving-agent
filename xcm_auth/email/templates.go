package email

import "fmt"

// build2FAEmail returns the subject and plaintext body for a 2FA code email.
// purpose should be "login", "password_reset", or "email_verify".
func build2FAEmail(appName, appURL, to, code, purpose string) (subject, body string) {
	switch purpose {
	case "login":
		subject = fmt.Sprintf("[%s] Your login verification code", appName)
		body = fmt.Sprintf(
			"%s - Login Verification\n"+
				"================================\n\n"+
				"A login attempt was made for this email address.\n\n"+
				"Your one-time verification code is:\n\n"+
				"    %s\n\n"+
				"This code expires in 10 minutes and can only be used once.\n\n"+
				"If you did not attempt to log in, your password may be compromised.\n"+
				"Please change it immediately at: %s\n\n"+
				"-- %s\n%s\n",
			appName, code, appURL+"/auth/forgot-password", appName, appURL,
		)

	case "password_reset":
		subject = fmt.Sprintf("[%s] Password reset code", appName)
		body = fmt.Sprintf(
			"%s - Password Reset\n"+
				"================================\n\n"+
				"A password reset was requested for: %s\n\n"+
				"Your reset verification code is:\n\n"+
				"    %s\n\n"+
				"This code expires in 10 minutes and can only be used once.\n\n"+
				"If you did not request a password reset, please ignore this email.\n\n"+
				"-- %s\n%s\n",
			appName, to, code, appName, appURL,
		)

	default: // "email_verify" and any unrecognised purpose
		subject = fmt.Sprintf("[%s] Email verification code", appName)
		body = fmt.Sprintf(
			"%s - Email Verification\n"+
				"================================\n\n"+
				"Please verify your email address by entering the code below:\n\n"+
				"    %s\n\n"+
				"This code expires in 10 minutes.\n\n"+
				"-- %s\n%s\n",
			appName, code, appName, appURL,
		)
	}
	return subject, body
}
