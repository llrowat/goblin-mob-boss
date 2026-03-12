import { useToast } from "../hooks/useToast";
import type { ToastType } from "../hooks/useToast";

const typeStyles: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: {
    bg: "rgba(90, 138, 92, 0.15)",
    border: "var(--success)",
    color: "var(--success)",
  },
  error: {
    bg: "rgba(196, 101, 74, 0.15)",
    border: "var(--danger)",
    color: "var(--danger)",
  },
  warning: {
    bg: "rgba(184, 148, 74, 0.15)",
    border: "var(--warning)",
    color: "var(--warning)",
  },
  info: {
    bg: "rgba(90, 138, 92, 0.08)",
    border: "var(--border)",
    color: "var(--text)",
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const style = typeStyles[toast.type];
        return (
          <div
            key={toast.id}
            className="toast"
            style={{
              background: style.bg,
              borderColor: style.border,
              color: style.color,
            }}
            onClick={() => removeToast(toast.id)}
            role="alert"
          >
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
