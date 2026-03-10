import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "../hooks/useToast";
import { ToastContainer } from "./ToastContainer";

function Trigger() {
  const { addToast } = useToast();
  return (
    <div>
      <button onClick={() => addToast("Success!", "success", 100000)}>
        Toast Success
      </button>
      <button onClick={() => addToast("Error!", "error", 100000)}>
        Toast Error
      </button>
    </div>
  );
}

describe("ToastContainer", () => {
  it("renders nothing when no toasts", () => {
    const { container } = render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>,
    );

    expect(container.querySelector(".toast-container")).toBeNull();
  });

  it("renders toasts with correct role", () => {
    render(
      <ToastProvider>
        <Trigger />
        <ToastContainer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Toast Success").click();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Success!");
  });

  it("renders multiple toasts", () => {
    render(
      <ToastProvider>
        <Trigger />
        <ToastContainer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Toast Success").click();
      screen.getByText("Toast Error").click();
    });

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
  });

  it("dismisses toast on click", () => {
    render(
      <ToastProvider>
        <Trigger />
        <ToastContainer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Toast Success").click();
    });

    expect(screen.getByText("Success!")).toBeInTheDocument();

    act(() => {
      screen.getByRole("alert").click();
    });

    expect(screen.queryByText("Success!")).not.toBeInTheDocument();
  });
});
