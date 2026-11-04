/*
 * What `financy mcp` keeps from the model, ported from the hosted server
 * (financy-remote-mcp's src/server.ts) so both surfaces hand an LLM the same
 * fields. The CLI's own table and --json output are the user's terminal and stay
 * whole; only MCP tool results pass through here.
 */

// Identifiers the Financy API returns that the model never needs and that must
// not leave for an LLM provider: national IDs and company numbers (psuId,
// psuCorporateId, ownerInfo.nationalId, customerId), and the caller's own org
// and login (orgId, userId — an email address) repeated on every row; from the
// integrations API, the business's customers' tax ids (businessTaxId) and the tail
// of the stored credential (maskedTail). No tool takes any of them as an argument.
export const REDACTED_KEYS: ReadonlySet<string> = new Set([
  'psuId',
  'psuIdType',
  'psuCorporateId',
  'psuCorporateIdType',
  'customerId',
  'nationalId',
  'orgId',
  'userId',
  'businessTaxId',
  'maskedTail',
])

// Who set a transaction's category or classification: the pipeline's own stamps
// stay, and a person's (their user id, which is their login) reads as USER. The
// categorizers are SYSTEM_CATEGORIZERS in service-accounts-aggregation's
// src/lib/transactions-pipeline/user-category.ts; a classification is SYSTEM's.
const SYSTEM_STAMPS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['categorizedBy', new Set(['KEYWORDS', 'MCC', 'GOOGLE', 'SYSTEM', 'GPT', 'NONE', 'USER'])],
  ['classifiedBy', new Set(['SYSTEM', 'USER'])],
])

const redactValue = (key: string, value: unknown): unknown => {
  const stamps = SYSTEM_STAMPS.get(key)
  return stamps && typeof value === 'string' && !stamps.has(value) ? 'USER' : value
}

/** A copy of `value` without REDACTED_KEYS at any depth, and a person's id in a category stamp read as USER. */
export function redactIdentifiers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactIdentifiers(item))
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !REDACTED_KEYS.has(key))
      .map(([key, inner]) => [key, redactIdentifiers(redactValue(key, inner))]),
  )
}
