<script setup lang="ts">
import { onMounted } from "vue";
import { BlockRate } from "block-rate";

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
  <h1>block-rate vue example</h1>
</template>
