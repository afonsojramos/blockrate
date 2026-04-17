// Next.js App Router example: the client posts to /api/block-rate on this
// origin; the matching server route (app/api/block-rate/route.ts) forwards
// upstream with the API key read from the server environment.
//
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { BlockRateScript } from "blockrate/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BlockRateScript
          providers={["optimizely", "posthog", "ga4"]}
          endpoint="/api/block-rate"
          sampleRate={0.1}
        />
      </body>
    </html>
  );
}
