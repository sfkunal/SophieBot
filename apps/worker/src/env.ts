export interface Env {
  DB: D1Database;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_USERNAME?: string;
  OPENAI_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  ALLOWED_PHONES: string;
  AUTH_SECRET: string;
  APP_URL: string;
  WEB_URL: string;
}

export function isTelegramConfigured(env: Env): boolean {
  return !!env.TELEGRAM_BOT_TOKEN?.trim();
}
