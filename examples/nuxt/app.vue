<!--
  Nuxt example: client side. Posts to a same-origin /api/block-rate route
  (see server/api/block-rate.post.ts) which forwards upstream with the API
  key held on the server.

  The reporter endpoint must be first-party — see
  https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
-->
<script setup lang="ts">
import { onMounted } from "vue";
import { BlockRate } from "blockrate";

onMounted(() => {
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

<template>
  <h1>block-rate nuxt example</h1>
</template>
