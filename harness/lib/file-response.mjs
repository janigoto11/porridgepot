export const fileResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "files"],
  properties: {
    summary: { type: "string" },
    files: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: { path: { type: "string" }, content: { type: ["string", "null"] } },
      },
    },
  },
};
