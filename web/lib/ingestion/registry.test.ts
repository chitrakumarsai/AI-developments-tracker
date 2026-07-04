import { describe, expect, it } from "vitest";

import { getConnector } from "./registry";
import { rssConnector } from "./rss/rss";
import { apiConnector } from "./api/router";

describe("getConnector", () => {
  it("returns the RSS connector for 'rss'", () => {
    expect(getConnector("rss")).toBe(rssConnector);
  });

  it("returns the API host router for 'api'", () => {
    expect(getConnector("api")).toBe(apiConnector);
  });

  it("returns null for types with no connector yet", () => {
    expect(getConnector("scrape")).toBeNull();
    expect(getConnector("manual")).toBeNull();
  });
});
