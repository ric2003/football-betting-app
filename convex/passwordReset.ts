import type { EmailConfig } from "@convex-dev/auth/server";

function generateCode() {
  const alphabet = "0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export const PasswordResetEmail: EmailConfig = {
  id: "resend-password-reset",
  type: "email",
  name: "Resend password reset",
  from: process.env.AUTH_RESEND_FROM ?? "World Cup Bets <onboarding@resend.dev>",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 10 * 60,
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest({ identifier, provider, token }) {
    if (!provider.apiKey) {
      throw new Error("Missing AUTH_RESEND_KEY for password reset emails.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: provider.from,
        to: identifier,
        subject: "Codigo para repor a password",
        text: [
          "Usa este codigo para repor a tua password no World Cup Bets 2026:",
          "",
          token,
          "",
          "O codigo expira em 10 minutos.",
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend error: ${await response.text()}`);
    }
  },
};
