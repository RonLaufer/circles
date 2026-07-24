const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_WITH_SHORT_LAST_GROUP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{11}$/i;
const HEX_DIGITS = "0123456789abcdef";

function cleanEventShareToken(rawToken: string) {
  return rawToken
    .trim()
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .toLowerCase();
}

export function getEventShareTokenCandidates(rawToken: string) {
  const token = cleanEventShareToken(rawToken);

  if (UUID_PATTERN.test(token)) return [token];

  // Some RTL messaging clients can omit the final hexadecimal character when
  // a UUID is the last item in a message. Try all 16 possible final digits and
  // accept only a candidate that actually exists in the database.
  if (UUID_WITH_SHORT_LAST_GROUP_PATTERN.test(token)) {
    return Array.from(HEX_DIGITS, (digit) => `${token}${digit}`);
  }

  return [];
}
