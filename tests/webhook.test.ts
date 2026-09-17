import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../src/webhook.js";

describe("webhook signature", () => {
  it("accepts the HMAC PurrPlan puts in X-Signature and rejects a swapped secret", () => {
    const rawBody = JSON.stringify({
      event: "post.published",
      data: { uuid: "post-1", status: "published" },
    });
    const secret = "whsec-demo";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(verifyWebhookSignature({ rawBody, signature, secret })).toBe(true);
    expect(verifyWebhookSignature({ rawBody, signature, secret: "autre" })).toBe(false);
    expect(verifyWebhookSignature({ rawBody, signature: "", secret })).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody: rawBody.replace("published", "failed"),
        signature,
        secret,
      }),
    ).toBe(false);
  });
});