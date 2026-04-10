import { BlockRateScript } from "block-rate/next";

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
