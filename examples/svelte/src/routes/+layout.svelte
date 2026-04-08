<script lang="ts">
  import { onMount } from "svelte";
  import { BlockRate } from "block-rate";

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
</script>

<slot />
