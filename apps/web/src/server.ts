import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { isPrivateResponseRequest, withPrivateResponseHeaders } from "./lib/private-response";

export default createServerEntry({
  async fetch(request, opts) {
    const response = await handler.fetch(request, opts);

    return isPrivateResponseRequest(request, new URL(request.url).pathname)
      ? withPrivateResponseHeaders(response)
      : response;
  },
});
