import { onMount } from "solid-js";
import { BlockRate } from "blockrate";

export default function App() {
  onMount(() => {
    const br = new BlockRate({
      providers: ["optimizely", "posthog", "ga4"],
      reporter: (result) => {
        navigator.sendBeacon("/api/block-rate", JSON.stringify(result));
      },
      sampleRate: 0.1,
    });
    br.check();
  });

  return <h1>block-rate solid example</h1>;
}
