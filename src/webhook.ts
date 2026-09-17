import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérifie X-Signature tel que PurrPlan le pose.
 *
 * Le serveur signe `json_encode($data)` en PHP, HMAC-SHA256, hex.
 * Il faut le corps brut de la requête : un JSON ré-encodé ne retombe
 * pas sur les mêmes octets (slashs échappés, ordre des clés).
 */
export function verifyWebhookSignature(input: {
  rawBody: string | Buffer;
  signature: string | null | undefined;
  secret: string;
}): boolean {
  if (!input.secret || !input.signature) {
    return false;
  }

  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const given = input.signature.trim();

  if (expected.length !== given.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}
