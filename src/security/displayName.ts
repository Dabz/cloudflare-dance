export const UNKNOWN_DISPLAY_NAME = "UNKNOWN";

const DISPLAY_NAME_COOKIE = "displayName";
const MAX_DISPLAY_NAME_LENGTH = 40;

export function sanitizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, MAX_DISPLAY_NAME_LENGTH);
}

export function getDisplayNameCookie(): string | undefined {
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === DISPLAY_NAME_COOKIE) {
      return sanitizeDisplayName(decodeURIComponent(valueParts.join("=")));
    }
  }
}

export function setDisplayNameCookie(displayName: string): void {
  document.cookie = `${DISPLAY_NAME_COOKIE}=${encodeURIComponent(displayName)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
