import { vi, type Mock } from "vitest";

/**
 * Chainable drizzle query-builder mock methods. Union of everything the API
 * route tests need; each returns the chain itself so any call order works.
 */
const CHAIN_METHODS = [
  "from",
  "where",
  "orderBy",
  "limit",
  "offset",
  "innerJoin",
  "leftJoin",
  "groupBy",
  "values",
  "set",
  "returning",
  "onConflictDoUpdate",
  "onConflictDoNothing",
] as const;

type ChainMethod = (typeof CHAIN_METHODS)[number];

export type Chain = Record<ChainMethod, Mock> & {
  then: (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

/** Minimal chainable drizzle query-builder mock; awaiting it resolves `result()`. */
export function makeChain(result: () => unknown): Chain {
  const chain: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (reason: unknown) => unknown,
  ) => Promise.resolve().then(result).then(onFulfilled, onRejected);
  return chain as unknown as Chain;
}

/**
 * Make each successive call to a mocked builder entry point (e.g. `db.select`)
 * resolve the next result in order. Returns the created chains in call order
 * so tests can assert on captured `where`/`set`/... arguments.
 */
export function queueSelects(mocked: Mock, ...results: unknown[]): Chain[] {
  const chains: Chain[] = [];
  const queue = [...results];
  mocked.mockImplementation(() => {
    const chain = makeChain(() => queue.shift());
    chains.push(chain);
    return chain;
  });
  return chains;
}
