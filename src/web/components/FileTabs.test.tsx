// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectNode } from "../../shared/api-types.ts";
import type { SelectedFile } from "../vault-types.ts";
import { FileTabs } from "./FileTabs.tsx";

afterEach(cleanup);

// happy-dom has no layout; the strip scrolls the active tab into view.
Element.prototype.scrollIntoView ??= () => {};

const file = (id: string, name: string, project: string): SelectedFile => ({
  id,
  name,
  projectId: `p-${project}`,
  project,
  workspace: "w",
  environment: null,
});
const project = { icon: null, framework: null } as unknown as ProjectNode;

function strip(files: SelectedFile[], activeId: string) {
  return (
    <FileTabs
      files={files}
      projectOf={() => project}
      activeId={activeId}
      dirtyIds={new Set()}
      onSelect={() => {}}
      onClose={() => {}}
      onReorder={() => {}}
    />
  );
}
const tabNames = () => screen.queryAllByRole("tab").map((t) => t.textContent);

const web = file("w1", ".env.local", "web");
const web2 = file("w2", ".env.production", "web");
const lens = file("l1", ".env.production", "Lensdrop");

describe("FileTabs", () => {
  it("shows no project chips while one project is open", () => {
    render(strip([web, web2], "w1"));
    expect(tabNames()).toEqual([".env.local", ".env.production"]);
    expect(screen.queryByRole("button", { name: /web/ })).toBeNull();
  });

  it("collapses and expands a project's tabs from its chip", () => {
    render(strip([web, web2, lens], "l1"));
    const chip = screen.getByRole("button", { name: /web/ });
    expect(chip.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(chip);
    expect(tabNames()).toEqual([".env.production"]);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    // The collapsed chip counts what it hides.
    expect(chip.textContent).toContain("2");

    fireEvent.click(chip);
    expect(tabNames()).toHaveLength(3);
  });

  it("opens a collapsed group when one of its tabs becomes active", () => {
    const { rerender } = render(strip([web, web2, lens], "l1"));
    fireEvent.click(screen.getByRole("button", { name: /web/ }));
    expect(tabNames()).toHaveLength(1);

    rerender(strip([web, web2, lens], "w2"));
    expect(tabNames()).toHaveLength(3);
  });
});
