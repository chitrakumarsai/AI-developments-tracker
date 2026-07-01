import type { Connector } from "../types";
import { githubConnector } from "./github";

/**
 * API host router — dispatches `ingestion_type='api'` sources to the right
 * provider connector by URL host. Mirrors how one RSS connector serves all RSS
 * sources: one `api` entry in the registry, many providers behind it. Hugging
 * Face slots in as another host branch in the next slice.
 */
const HOST_CONNECTORS: Array<{ match: (host: string) => boolean; connector: Connector }> = [
  { match: (host) => host === "api.github.com", connector: githubConnector },
];

export const apiConnector: Connector = async (source) => {
  let host: string;
  try {
    host = new URL(source.url).hostname;
  } catch {
    return { sourceId: source.id, items: [], warnings: [`Invalid API source URL: ${source.url}`] };
  }

  const entry = HOST_CONNECTORS.find((h) => h.match(host));
  if (!entry) {
    return {
      sourceId: source.id,
      items: [],
      warnings: [`No API connector for host '${host}' yet.`],
    };
  }
  return entry.connector(source);
};
