/** Railway's private network encrypts traffic with WireGuard. External
 * production connections use certificate-verified TLS. */
export function postgresOptions(url: string, nodeEnv: string, max = 5) {
  const host = URL.parse(url)?.hostname;
  const isRailwayPrivate = host !== undefined && /^[a-z0-9-]+\.railway\.internal$/.test(host);
  return {
    ssl: nodeEnv === "production" && !isRailwayPrivate,
    prepare: false,
    max,
    idle_timeout: 20,
    connect_timeout: 10,
  };
}
