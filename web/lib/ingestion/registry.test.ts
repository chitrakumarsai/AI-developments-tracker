import { describe, expect, it } from "vitest";

import { getConnector } from "./registry";
import { rssConnector } from "./rss/rss";

describe("getConnector", () => {
  it("returns the RSS connector for 'rss'", () => {
    expect(getConnector("rss")).toBe(rssConnector);
  });

  it("returns null for types with no connector yet", () => {
    expect(getConnector("api")).toBeNull();
    expect(getConnector("scrape")).toBeNull();
    expect(getConnector("manual")).toBeNull();
  });
});
