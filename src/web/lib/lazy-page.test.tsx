// @vitest-environment happy-dom
import { Suspense } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyPage } from "./lazy-page.tsx";

afterEach(cleanup);

const Hello = ({ name }: { name: string }) => <p>hello {name}</p>;

describe("lazyPage", () => {
  it("renders synchronously once preloaded", async () => {
    const load = vi.fn(async () => Hello);
    const Page = lazyPage(load);
    await Page.preload();
    render(
      <Suspense fallback={<p>loading</p>}>
        <Page name="klef" />
      </Suspense>,
    );
    // No fallback frame: the chunk was already in.
    expect(screen.getByText("hello klef")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
  });

  it("suspends, then renders, when not preloaded", async () => {
    const Page = lazyPage(async () => Hello);
    render(
      <Suspense fallback={<p>loading</p>}>
        <Page name="klef" />
      </Suspense>,
    );
    expect(screen.getByText("loading")).toBeTruthy();
    await act(async () => {});
    expect(await screen.findByText("hello klef")).toBeTruthy();
  });

  it("loads the chunk once however often it is preloaded", async () => {
    const load = vi.fn(async () => Hello);
    const Page = lazyPage(load);
    await Promise.all([Page.preload(), Page.preload()]);
    render(<Page name="klef" />);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
