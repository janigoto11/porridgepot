export function assertReview(review, expected) {
  for (const key of ["scope", "sourceRevision", "requestDigest", "provider", "model"]) {
    if (review[key] !== expected[key]) throw new Error(`Review context mismatch: ${key}`);
  }
  if (expected.provider === "unconfigured" && review.status !== "not_configured")
    throw new Error("Unconfigured provider cannot approve");
  if (review.findings.some((f) => f.severity === "error"))
    throw new Error("Review contains blocking findings");
  if (review.status === "changes_requested") throw new Error("AI review requests changes");
  if (
    review.status !== "approved" &&
    !(
      expected.scope === "assignment" &&
      expected.provider === "unconfigured" &&
      review.status === "not_configured"
    )
  )
    throw new Error("AI review approval required");
}
