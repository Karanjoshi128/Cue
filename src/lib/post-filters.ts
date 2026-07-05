// Shared between the queue page (searchParam validation) and the queue list
// (filter pills) so the two never drift.
export const POST_FILTERS = [
  "ALL",
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIAL",
  "FAILED",
] as const;

export type PostFilter = (typeof POST_FILTERS)[number];
