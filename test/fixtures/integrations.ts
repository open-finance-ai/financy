/**
 * Synthetic integrations API bodies (shapes per the public integrations API:
 * `{items}` lists, `{items, nextCursor, freshness}` record pages, money in
 * integer minor units). No real business or customer data.
 */
export const INTEGRATION_ID = 'intg_01J9ZK3Q8W7M5N2P4R6T8V0X1Y'
export const DOCUMENT_ID = 'idoc_01J9ZK4A2B3C4D5E6F7G8H9J0K'
export const CUSTOMER_ID = 'icus_01J9ZK5M6N7P8Q9R0S1T2V3W4X'
export const PROPOSAL_ID = 'prop_01J9ZK6A1B2C3D4E5F6G7H8J9K'

export const integration = {
  id: INTEGRATION_ID,
  connectorId: 'invoice4u',
  connectorName: 'Invoice4U',
  category: 'invoicing',
  label: 'Invoice4U',
  status: 'active',
  auth: { state: 'active', reason: null, attention: null },
  sync: {
    documents: { state: 'idle', stale: false, lastSuccessAt: '2026-10-11T06:00:00Z' },
    customers: { state: 'idle', stale: false, lastSuccessAt: '2026-10-11T06:00:00Z' },
  },
  externalAiApps: 'read',
}

export const freshness = { dataAsOf: '2026-10-11T06:00:00Z', stale: false }

export const document = {
  recordType: 'document',
  id: DOCUMENT_ID,
  integrationId: INTEGRATION_ID,
  connectorId: 'invoice4u',
  type: 'invoice',
  number: '1001',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  counterparty: { id: CUSTOMER_ID, name: 'סטודיו גל' },
  currency: 'ILS',
  amounts: { grossMinor: 234000, netMinor: 198305, vatMinor: 35695 },
  status: 'open',
  receivable: { isReceivable: true, kind: 'tax_invoice', remainingMinor: 234000, state: 'open', effectiveDueDate: '2026-10-01' },
}

export const customer = {
  recordType: 'customer',
  id: CUSTOMER_ID,
  integrationId: INTEGRATION_ID,
  name: 'סטודיו גל',
  businessTaxId: '500000000',
  active: true,
}

export const receivables = {
  asOf: '2026-10-11',
  integrations: [
    { integrationId: INTEGRATION_ID, connectorId: 'invoice4u', dataAsOf: '2026-10-11T06:00:00Z', stale: false, ready: 'history' },
  ],
  byCurrency: [
    {
      currency: 'ILS',
      totals: { openMinor: 234000, overdueMinor: 234000, documentCount: 1, buckets: { current: 0, '1_30': 234000, '31_60': 0, '61_90': 0, '90_plus': 0 } },
    },
  ],
  customers: [
    {
      counterparty: { id: CUSTOMER_ID, name: 'סטודיו גל' },
      currency: 'ILS',
      openMinor: 234000,
      overdueMinor: 234000,
      documentCount: 1,
      maxDaysPastDue: 10,
    },
  ],
  truncated: { customersShown: 1, customersTotal: 1 },
}

export const proposal = {
  id: PROPOSAL_ID,
  integrationId: INTEGRATION_ID,
  connectorId: 'invoice4u',
  action: 'create_tax_invoice',
  status: 'pending_approval',
  expiresAt: '2026-10-18T09:00:00Z',
  createdAt: '2026-10-11T09:00:00Z',
  items: [{ itemId: 'pi_01J9ZK7A1B2C3D4E5F6G7H8J9K', warnings: [], operation: null }],
  totals: { count: 1, grossMinor: 234000, currency: 'ILS' },
  approvalUrl: 'https://app.example.com/approve/prop_01J9ZK6A1B2C3D4E5F6G7H8J9K',
}

export const draftRequest = {
  action: 'create_tax_invoice',
  items: [
    {
      counterpartyId: CUSTOMER_ID,
      lines: [{ description: 'עיצוב לוגו', quantity: 1, unitPriceMinor: 234000 }],
      pricesIncludeVat: true,
    },
  ],
}

export const upgradeRequired = {
  type: 'UPGRADE_REQUIRED',
  message: 'Invoice4U is available on the Starter plan and above.',
  retryable: false,
  userActionRequired: true,
  action: { kind: 'upgrade', plan: 'starter' },
  requestId: 'req_test_1',
}

export const CLEARING_ID = 'intg_01J9ZK7C1E2A3R4I5N6G7I8D9X'

/** A card-clearing integration (Isracard Business): payouts, no documents. */
export const clearingIntegration = {
  id: CLEARING_ID,
  connectorId: 'isracard',
  connectorName: 'ישראכרט עסקים',
  category: 'clearing',
  label: 'ישראכרט עסקים',
  status: 'active',
  auth: { state: 'active', reason: null, attention: null },
  sync: { settlements: { state: 'idle', stale: false, lastSuccessAt: '2026-10-18T05:00:00Z' } },
  externalAiApps: 'read',
}

/** Two payouts: one already in the bank, one expected. The merchant number is a placeholder. */
export const settlementSettled = {
  recordType: 'settlement',
  id: 'iset_01J9ZK8S1E2T3T4L5E6D7A8B9C',
  providerId: '0000000:2026-10-08:ILS',
  integrationId: CLEARING_ID,
  connectorId: 'isracard',
  status: 'settled',
  paymentDate: '2026-10-08',
  branch: '0000000',
  payoutAccount: '1234',
  currency: 'ILS',
  amounts: { grossMinor: 1250000, commissionMinor: 12500, vatMinor: 2125, discountMinor: 0, chargingFeeMinor: 0, advanceRepaymentFeeMinor: 0, netMinor: 1235375 },
}

export const settlementExpected = {
  ...settlementSettled,
  id: 'iset_01J9ZK9E1X2P3E4C5T6E7D8A9B',
  providerId: '0000000:2026-10-22:ILS',
  status: 'expected',
  paymentDate: '2026-10-22',
  amounts: { grossMinor: 980000, commissionMinor: 9800, vatMinor: 1666, discountMinor: 0, chargingFeeMinor: 0, advanceRepaymentFeeMinor: 0, netMinor: 968534 },
}
