import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({ component: Docs });

function Docs() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight">Documentation</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Full docs are coming. For now, the README covers everything you need
        to integrate the OSS library and self-host the server.
      </p>
      <div className="mt-8 space-y-4 text-sm">
        <a
          href="https://github.com/afonsojramos/block-rate#readme"
          className="block rounded-md border border-border bg-card p-4 transition-[background-color] duration-150 hover:bg-accent"
        >
          <div className="font-medium">README on GitHub</div>
          <div className="mt-1 text-muted-foreground">
            Quick start, providers, configuration, framework adapters, query
            examples.
          </div>
        </a>
        <a
          href="https://github.com/afonsojramos/block-rate/tree/main/packages/server"
          className="block rounded-md border border-border bg-card p-4 transition-[background-color] duration-150 hover:bg-accent"
        >
          <div className="font-medium">Self-hosted server</div>
          <div className="mt-1 text-muted-foreground">
            Run your own ingestion server with SQLite or Postgres. Bun + Drizzle.
          </div>
        </a>
      </div>
    </main>
  );
}
