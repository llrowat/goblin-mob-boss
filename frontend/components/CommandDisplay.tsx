import { useState } from "react";

interface Props {
  /** The shell command to display */
  command: string | null;
  /** Label for the toggle button (default: "View Command" / "Hide Command") */
  label?: string;
  /** Size variant for the button */
  size?: "sm" | "md";
}

/**
 * A toggle button + code block that reveals the underlying shell command being
 * run on the user's behalf. Promotes transparency — users can always see
 * exactly what's happening under the hood.
 *
 * Renders a wrapper div containing a button and a collapsible code block.
 * When placed inside a flex row of buttons, use CommandDisplayButton +
 * CommandDisplayContent separately for layout control.
 */
export function CommandDisplay({ command, label, size = "sm" }: Props) {
  const [show, setShow] = useState(false);

  if (!command) return null;

  return (
    <div>
      <button
        className={`btn btn-secondary btn-${size}`}
        onClick={() => setShow(!show)}
      >
        {show ? "Hide Command" : label ?? "View Command"}
      </button>
      {show && (
        <div
          className="code-block"
          style={{ wordBreak: "break-all", marginTop: 8 }}
        >
          {command}
        </div>
      )}
    </div>
  );
}

/**
 * Hook for split rendering: returns toggle state, a button element,
 * and a content element that can be placed in different parts of the layout.
 */
export function useCommandDisplay(command: string | null) {
  const [show, setShow] = useState(false);

  return {
    show,
    toggle: () => setShow(!show),
    command,
  };
}

interface ButtonProps {
  show: boolean;
  toggle: () => void;
  command: string | null;
  label?: string;
  size?: "sm" | "md";
}

/** Just the toggle button — pair with CommandDisplayContent for the code block. */
export function CommandDisplayButton({
  show,
  toggle,
  command,
  label,
  size = "sm",
}: ButtonProps) {
  if (!command) return null;

  return (
    <button className={`btn btn-secondary btn-${size}`} onClick={toggle}>
      {show ? "Hide Command" : label ?? "View Command"}
    </button>
  );
}

interface ContentProps {
  show: boolean;
  command: string | null;
}

/** The collapsible code block — pair with CommandDisplayButton. */
export function CommandDisplayContent({ show, command }: ContentProps) {
  if (!show || !command) return null;

  return (
    <div
      className="code-block"
      style={{ wordBreak: "break-all", marginTop: 8 }}
    >
      {command}
    </div>
  );
}
