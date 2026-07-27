/** Granular exit codes — the CLI's machine-readable failure contract. */
export const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  AUTH: 3,
  PLAN: 4,
  CREDITS: 5,
  NOT_FOUND: 6,
  API: 7,
} as const
