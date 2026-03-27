import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ClauseOutput } from "./ClauseOutput";

const mockInvoke = vi.mocked(invoke);

describe("ClauseOutput", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("renders a View Output button", () => {
    render(<ClauseOutput processType="skill" active={false} />);
    expect(screen.getByText("View Output")).toBeInTheDocument();
  });

  it("does not show log content initially", () => {
    render(<ClauseOutput processType="skill" active={false} />);
    expect(screen.queryByText("Waiting for output...")).not.toBeInTheDocument();
  });

  it("shows log content when expanded and active", async () => {
    mockInvoke.mockResolvedValue("log line 1\nlog line 2");
    render(<ClauseOutput processType="skill" active={true} />);

    fireEvent.click(screen.getByText("View Output"));

    await waitFor(() => {
      expect(screen.getByText(/log line 1/)).toBeInTheDocument();
    });
  });

  it("shows placeholder when expanded and no log content yet", async () => {
    mockInvoke.mockResolvedValue("");
    render(<ClauseOutput processType="skill" active={true} />);

    fireEvent.click(screen.getByText("View Output"));

    await waitFor(() => {
      expect(screen.getByText("Waiting for output...")).toBeInTheDocument();
    });
  });

  it("shows no output message when inactive and no content", async () => {
    mockInvoke.mockResolvedValue("");
    render(<ClauseOutput processType="skill" active={false} />);

    fireEvent.click(screen.getByText("View Output"));

    await waitFor(() => {
      expect(screen.getByText("No output captured.")).toBeInTheDocument();
    });
  });

  it("toggles to Hide Output when expanded", () => {
    render(<ClauseOutput processType="skill" active={false} />);
    fireEvent.click(screen.getByText("View Output"));
    expect(screen.getByText("Hide Output")).toBeInTheDocument();
  });

  it("collapses when Hide Output is clicked", async () => {
    mockInvoke.mockResolvedValue("some log");
    render(<ClauseOutput processType="skill" active={true} />);

    fireEvent.click(screen.getByText("View Output"));
    await waitFor(() => {
      expect(screen.getByText(/some log/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Hide Output"));
    expect(screen.queryByText(/some log/)).not.toBeInTheDocument();
    expect(screen.getByText("View Output")).toBeInTheDocument();
  });

  it("passes correct args for ideation process type", async () => {
    mockInvoke.mockResolvedValue("ideation log");
    render(
      <ClauseOutput
        processType="ideation"
        processId="feat-1"
        repoPath="/home/user/myrepo"
        active={true}
      />,
    );

    fireEvent.click(screen.getByText("View Output"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("read_process_log", {
        processType: "ideation",
        processId: "feat-1",
        repoPath: "/home/user/myrepo",
        maxLines: null,
      });
    });
  });

  it("passes correct args for skill process type (no id/path)", async () => {
    mockInvoke.mockResolvedValue("skill log");
    render(<ClauseOutput processType="skill" active={true} />);

    fireEvent.click(screen.getByText("View Output"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("read_process_log", {
        processType: "skill",
        processId: null,
        repoPath: null,
        maxLines: null,
      });
    });
  });
});
