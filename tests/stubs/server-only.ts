/**
 * `server-only` throws when imported outside a React Server Component, which
 * includes the test runner. The guard is worth keeping in the app, so it is
 * stubbed here rather than removed from the modules that carry it: what these
 * tests exercise is the crypto and the queries, not where Next will allow the
 * import.
 */
export {}
