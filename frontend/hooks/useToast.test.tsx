import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./useToast";

function TestConsumer() {
  const { toasts, addToast, removeToast } = useToast();
  return (
    <div>
      <button onClick={() => addToast("Hello", "success", 100000)}>Add</button>
      <button onClick={() => addToast("Warning!", "warning", 100000)}>Add Warning</button>
      {toasts.map((t) => (
        <div key={t.id} data-testid={`toast-${t.id}`}>
          <span data-testid="toast-msg">{t.message}</span>
          <span data-testid="toast-type">{t.type}</span>
          <button onClick={() => removeToast(t.id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds and displays a toast", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Add").click();
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("removes a toast when dismissed", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Add").click();
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();

    act(() => {
      screen.getByText("Dismiss").click();
    });

    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("auto-removes toast after duration", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Add").click();
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100001);
    });

    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("supports multiple toasts", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Add").click();
      screen.getByText("Add Warning").click();
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Warning!")).toBeInTheDocument();
  });

  it("defaults type to info", () => {
    function InfoConsumer() {
      const { toasts, addToast } = useToast();
      return (
        <div>
          <button onClick={() => addToast("Default type", undefined, 100000)}>Add Default</button>
          {toasts.map((t) => (
            <span key={t.id} data-testid="type">{t.type}</span>
          ))}
        </div>
      );
    }

    render(
      <ToastProvider>
        <InfoConsumer />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Add Default").click();
    });

    expect(screen.getByTestId("type")).toHaveTextContent("info");
  });
});
