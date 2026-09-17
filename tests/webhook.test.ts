import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
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

  it("accepts the body the partner example signs, slashes escaped like PHP", () => {
    const source = readFileSync(new URL("../examples/partner-flow.mjs", import.meta.url), "utf8");
    const start = source.indexOf("const sample = ");
    const end = source.indexOf("const { createHmac }", start);
    const sample = new Function(`${source.slice(start, end)}; return sample;`)();

    expect(typeof sample).toBe("string");
    expect(sample).toContain("https:\\/\\/app.purrplan.ai");

    const secret = "whsec-demo";
    const signature = createHmac("sha256", secret).update(sample).digest("hex");
    expect(verifyWebhookSignature({ rawBody: sample, signature, secret })).toBe(true);
    expect(
      verifyWebhookSignature({
        rawBody: sample.replaceAll("\\/", "/"),
        signature,
        secret,
      }),
    ).toBe(false);
  });
});