import "@testing-library/jest-dom/vitest";

// Mock Tauri IPC
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
