import Ajv from "ajv";

export const deliveryReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "blockingFindings", "observations"],
  properties: {
    verdict: { enum: ["pass", "fail"] },
    summary: { type: "string", minLength: 1 },
    blockingFindings: { type: "array", items: { type: "string", minLength: 1 } },
    observations: { type: "array", items: { type: "string", minLength: 1 } },
  },
};
const validate = new Ajv().compile({
  ...deliveryReviewSchema,
  required: [...deliveryReviewSchema.required, "baseCommit", "headCommit"],
  properties: {
    ...deliveryReviewSchema.properties,
    baseCommit: { type: "string", pattern: "^[a-f0-9]{40}$" },
    headCommit: { type: "string", pattern: "^[a-f0-9]{40}$" },
  },
});
export function assertDeliveryReview(review, { baseCommit, headCommit }) {
  if (!validate(review))
    throw new Error("Invalid implementation review report; a new review is required");
  if (review.baseCommit !== baseCommit || review.headCommit !== headCommit)
    throw new Error("Review provenance mismatch");
  if (review.verdict !== "pass" || review.blockingFindings.length)
    throw new Error("AI review blocked implementation");
}
