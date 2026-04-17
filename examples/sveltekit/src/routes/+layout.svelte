<!--
  SvelteKit example: client side. Posts to a same-origin /api/block-rate
  route (see src/routes/api/block-rate/+server.ts) which forwards upstream
  with the API key held on the server.

  The reporter endpoint must be first-party — see
  https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { BlockRate } from "blockrate";

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
