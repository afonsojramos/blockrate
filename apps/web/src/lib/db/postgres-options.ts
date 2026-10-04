/** Shared by the query pool and startup migrator. Prepared statements are
 * disabled for transaction poolers; production TLS verifies certificates. */
export function postgresOptions(nodeEnv: string, max = 5) {
  return {
    ssl: nodeEnv === "production",
    prepare: false,
    max,
    idle_timeout: 20,
    connect_timeout: 10,
  };
}
