/**
 * Recorded shape of `GET /v2/connections` — `{ items, nextPage, count }` with
 * MappedConnection items (fields per service-accounts-aggregation
 * src/data/map-connections.ts). Two connections: one ACTIVE/fresh, one in
 * FETCHING_ERROR, mirroring the locked interface prototype.
 */
export const connectionsResponse = {
  items: [
    {
      id: 'conn_01HTX4M9K2',
      providerId: 'HAPOALIM',
      status: 'ACTIVE',
      mode: 'REAL',
      accounts: 2,
      cards: 0,
      savings: 1,
      loans: 0,
      securities: 0,
      transactions: 412,
      startDate: '2026-01-12',
      expiryDate: '2026-10-12',
      lastFetchedDataDate: '2026-07-22',
      lastFetchedAt: '2026-07-23T04:12:09Z',
      createdAt: '2026-01-12T09:31:00Z',
      updatedAt: '2026-07-23T04:12:09Z',
      error: null,
    },
    {
      id: 'conn_01HV8Q2E7N',
      providerId: 'CAL',
      status: 'FETCHING_ERROR',
      mode: 'REAL',
      accounts: 0,
      cards: 2,
      savings: 0,
      loans: 0,
      securities: 0,
      transactions: 238,
      startDate: '2026-02-03',
      expiryDate: '2026-11-03',
      lastFetchedDataDate: '2026-07-19',
      lastFetchedAt: '2026-07-20T04:02:44Z',
      createdAt: '2026-02-03T14:05:00Z',
      updatedAt: '2026-07-20T04:02:44Z',
      error: {
        code: 'PROVIDER_TIMEOUT',
        message: 'CAL did not respond within the fetch window',
      },
    },
  ],
  nextPage: null,
  count: 2,
}
