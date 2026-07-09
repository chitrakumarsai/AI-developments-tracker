import { describe, expect, it } from "vitest";

import { makeValidatingLookup } from "./safe-agent";

type Cb = (err: unknown, address?: unknown, family?: number) => void;

/** Drive the callback-style lookup as a promise for assertions. */
function run(
  lookup: ReturnType<typeof makeValidatingLookup>,
  host: string,
  options: Record<string, unknown> = {},
): Promise<{ err: unknown; address: unknown }> {
  return new Promise((resolve) => {
    lookup(host, options, ((err, address) => resolve({ err, address })) as Cb);
  });
}

describe("makeValidatingLookup", () => {
  it("passes a public address through unchanged", async () => {
    const resolver = ((_h: string, _o: unknown, cb: Cb) => cb(null, "93.184.216.34", 4)) as never;
    const { err, address } = await run(makeValidatingLookup(resolver), "example.com");
    expect(err).toBeNull();
    expect(address).toBe("93.184.216.34");
  });

  it("blocks a host that resolves to a link-local/metadata IP", async () => {
    const resolver = ((_h: string, _o: unknown, cb: Cb) =>
      cb(null, "169.254.169.254", 4)) as never;
    const { err } = await run(makeValidatingLookup(resolver), "rebind.example");
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/private address 169\.254\.169\.254/);
  });

  it("blocks when ANY address in an all:true result is private", async () => {
    const resolver = ((_h: string, _o: unknown, cb: Cb) =>
      cb(null, [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ])) as never;
    const { err } = await run(makeValidatingLookup(resolver), "x", { all: true });
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/10\.0\.0\.1/);
  });

  it("propagates a resolver error untouched", async () => {
    const boom = Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });
    const resolver = ((_h: string, _o: unknown, cb: Cb) => cb(boom, "", 0)) as never;
    const { err } = await run(makeValidatingLookup(resolver), "nope.example");
    expect(err).toBe(boom);
  });
});
