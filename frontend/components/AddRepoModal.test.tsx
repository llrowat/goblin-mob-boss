import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { AddRepoModal } from "./AddRepoModal";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

describe("AddRepoModal", () => {
  const onClose = vi.fn();
  const onAdded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the modal title", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    expect(screen.getByText("Add Repository")).toBeInTheDocument();
  });

  it("renders path input and Browse/Detect buttons", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    expect(screen.getByPlaceholderText("/home/user/my-project")).toBeInTheDocument();
    expect(screen.getByText("Browse")).toBeInTheDocument();
    expect(screen.getByText("Detect")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when overlay is clicked", () => {
    const { container } = render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not show name/branch fields before detection", () => {
    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);
    // Before detection, the Name and Base Branch inputs should not be shown
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Base Branch")).not.toBeInTheDocument();
  });

  it("shows form fields after successful detection", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      name: "my-project",
      base_branch: "main",
    });

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/some/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("my-project")).toBeInTheDocument();
      expect(screen.getByDisplayValue("main")).toBeInTheDocument();
    });
  });

  it("shows error when detection fails", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("Not a git repo");

    render(<AddRepoModal onClose={onClose} onAdded={onAdded} />);

    fireEvent.change(screen.getByPlaceholderText("/home/user/my-project"), {
      target: { value: "/bad/path" },
    });
    fireEvent.click(screen.getByText("Detect"));

    await waitFor(() => {
      expect(screen.getByText("Not a git repo")).toBeInTheDocument();
    });
  });
});
