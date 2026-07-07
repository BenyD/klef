// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvTable } from "./EnvTable.tsx";

afterEach(cleanup);

const TEXT = "# Database\nDATABASE_URL=postgres://x\nAPI_KEY=sk_test\n";

describe("EnvTable (KV lens over raw env text)", () => {
  it("renders entries as editable rows and comments verbatim", () => {
    render(<EnvTable text={TEXT} onChange={() => {}} />);
    expect(screen.getByText("# Database")).toBeTruthy();
    expect(
      (screen.getByLabelText("Value for API_KEY") as HTMLInputElement).value,
    ).toBe("sk_test");
  });

  it("hides blank lines instead of rendering separator rows", () => {
    render(<EnvTable text={"A=1\n\n\n# Section\nB=2\n"} onChange={() => {}} />);
    // Two entries + one comment; the blank lines produce no rows.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("commits a value edit on blur as a one-line mutation", () => {
    const onChange = vi.fn();
    render(<EnvTable text={TEXT} onChange={onChange} />);

    const input = screen.getByLabelText("Value for API_KEY");
    fireEvent.change(input, { target: { value: "sk_live" } });
    expect(onChange).not.toHaveBeenCalled(); // not per keystroke
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(
      "# Database\nDATABASE_URL=postgres://x\nAPI_KEY=sk_live\n",
    );
  });

  it("reverts an invalid key on blur instead of corrupting the line", () => {
    const onChange = vi.fn();
    render(<EnvTable text={TEXT} onChange={onChange} />);

    const input = screen.getByLabelText("Key for API_KEY") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "BAD KEY" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("API_KEY");
  });

  it("deletes a row", () => {
    const onChange = vi.fn();
    render(<EnvTable text={TEXT} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Delete API_KEY"));
    expect(onChange).toHaveBeenCalledWith(
      "# Database\nDATABASE_URL=postgres://x\n",
    );
  });

  it("appends a new entry via the add row", () => {
    const onChange = vi.fn();
    render(<EnvTable text={TEXT} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("New key"), {
      target: { value: "REDIS_URL" },
    });
    fireEvent.change(screen.getByLabelText("New value"), {
      target: { value: "redis://localhost" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onChange).toHaveBeenCalledWith(`${TEXT}REDIS_URL=redis://localhost\n`);
  });

  it("disables Add until the key is valid", () => {
    render(<EnvTable text="" onChange={() => {}} />);
    const add = screen.getByRole("button", { name: /add/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New key"), {
      target: { value: "1BAD" },
    });
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New key"), {
      target: { value: "GOOD_KEY" },
    });
    expect(add.disabled).toBe(false);
  });
});

describe("EnvTable inline diff (on by default, toggleable)", () => {
  it("shows changes by default; the toggle hides them", () => {
    render(
      <EnvTable
        text={"API_KEY=sk_live\n"}
        onChange={() => {}}
        baseline={"API_KEY=sk_test\n"}
      />,
    );
    expect(screen.getByText("API_KEY=sk_test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show changes" }));
    expect(screen.queryByText("API_KEY=sk_test")).toBeNull();
  });

  it("shows the old line diff-style and reverts it in one click", () => {
    const onChange = vi.fn();
    render(
      <EnvTable
        text={"API_KEY=sk_live\n"}
        onChange={onChange}
        baseline={"API_KEY=sk_test\n"}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(onChange).toHaveBeenCalledWith("API_KEY=sk_test\n");
  });

  it("lists a deleted key as a removed line and restores it by appending", () => {
    const onChange = vi.fn();
    render(
      <EnvTable
        text={"A=1\n"}
        onChange={onChange}
        baseline={"A=1\nGONE_KEY=bye\n"}
      />,
    );
    expect(screen.getByText("GONE_KEY=bye")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onChange).toHaveBeenCalledWith("A=1\nGONE_KEY=bye\n");
  });

  it("shows nothing extra when the draft matches the baseline", () => {
    render(<EnvTable text={TEXT} onChange={() => {}} baseline={TEXT} />);
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("stays on and disabled while comparing a version", () => {
    render(
      <EnvTable
        text={"A=1\n"}
        onChange={() => {}}
        baseline={"A=2\n"}
        comparing
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "Show changes",
    }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText("A=2")).toBeTruthy();
  });
});

describe("EnvTable bulk selection", () => {
  it("deletes the selected rows in one go", () => {
    const onChange = vi.fn();
    render(<EnvTable text={TEXT} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select DATABASE_URL" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select API_KEY" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onChange).toHaveBeenCalledWith("# Database\n");
  });

  it("select-all covers every entry row", () => {
    const onChange = vi.fn();
    render(<EnvTable text={TEXT} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all keys" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
  });
});
