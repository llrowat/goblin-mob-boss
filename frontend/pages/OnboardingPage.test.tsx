import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingPage } from "./OnboardingPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the welcome hero", () => {
    renderPage();

    expect(screen.getByText("Welcome to Goblin Mob Boss")).toBeInTheDocument();
    expect(
      screen.getByText(/ready to scheme and ship features/),
    ).toBeInTheDocument();
  });

  it("renders all four onboarding steps with functional titles", () => {
    renderPage();

    expect(screen.getByText("Add Repositories")).toBeInTheDocument();
    expect(screen.getByText("Create Agents")).toBeInTheDocument();
    expect(screen.getByText("Build a System Map")).toBeInTheDocument();
    expect(screen.getByText("Implement Features")).toBeInTheDocument();
  });

  it("renders flavor subtext for each step", () => {
    renderPage();

    expect(screen.getByText("Claim your turf.")).toBeInTheDocument();
    expect(screen.getByText("Assemble the mob.")).toBeInTheDocument();
    expect(screen.getByText("Map the territory.")).toBeInTheDocument();
    expect(screen.getByText("Time to hustle.")).toBeInTheDocument();
  });

  it("renders step descriptions", () => {
    renderPage();

    expect(screen.getByText(/Point GMB at the repos/)).toBeInTheDocument();
    expect(screen.getByText(/Define specialized agents/)).toBeInTheDocument();
    expect(screen.getByText(/Lay out your architecture/)).toBeInTheDocument();
    expect(screen.getByText(/Describe what you want to build/)).toBeInTheDocument();
  });

  it("renders action buttons for each step", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /Add Repositories/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Agents/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Build System Map/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start a Feature/ })).toBeInTheDocument();
  });

  it("navigates to repos page when step 1 button is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Add Repositories/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/repos");
  });

  it("navigates to agents page when step 2 button is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Create Agents/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/agents");
  });

  it("navigates to system map page when step 3 button is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Build System Map/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/map");
  });

  it("navigates to features page when step 4 button is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByText(/Start a Feature/));

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("navigates when clicking a step card", () => {
    renderPage();

    // Click the step card container (not the button)
    const stepTitle = screen.getByText("Add Repositories");
    fireEvent.click(stepTitle.closest(".onboarding-step")!);

    expect(mockNavigate).toHaveBeenCalledWith("/repos");
  });

  it("renders the footer hint", () => {
    renderPage();

    expect(
      screen.getByText(/return here any time by clicking the goblin logo/),
    ).toBeInTheDocument();
  });

  it("displays step numbers", () => {
    renderPage();

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
