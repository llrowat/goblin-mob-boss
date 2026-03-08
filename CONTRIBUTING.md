# Contributing to Goblin Mob Boss

Thanks for your interest in contributing! Whether you're fixing a bug, adding a feature, or improving docs, your help is welcome.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri v2 system dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Setup

```bash
# Clone the repo
git clone https://github.com/llrowat/goblin-mob-boss.git
cd goblin-mob-boss

# Install frontend dependencies
npm install

# Run in dev mode (starts both Vite and Tauri)
npm run tauri dev
```

## Development Workflow

1. **Fork the repo** and create a feature branch from `main`
2. **Make your changes** — keep them focused and minimal
3. **Write tests** — every change must include corresponding tests
4. **Run the test suite** before submitting:
   ```bash
   # Frontend tests
   npm test

   # Rust backend tests (requires GTK/WebKit dev libs)
   cd backend && cargo test --lib
   ```
5. **Open a pull request** against `main`

## Code Style

- **Rust** — Follow standard Rust conventions. Use `cargo fmt` and `cargo clippy` before committing.
- **TypeScript/React** — Use the project's existing patterns. Run `npm run lint` to check for issues.
- **Commits** — Write clear, concise commit messages. Use imperative mood (e.g., "Add feature" not "Added feature").

## Testing Requirements

Tests are mandatory for all changes:

- **Rust backend**: Add `#[cfg(test)] mod tests { ... }` blocks in the module being tested. Use `tempfile` for tests that need filesystem access.
- **Frontend**: Use Vitest + React Testing Library. Place test files next to source files (e.g., `Foo.test.tsx` next to `Foo.tsx`). Mock Tauri `invoke` calls via the setup in `frontend/test/setup.ts`.

## Project Structure

See the [README](README.md#project-structure) for an overview of the codebase layout.

## Voice & Tone

The app has a light goblin mob-boss personality in its UI copy. If you're adding user-facing text:

- Keep themed language subtle — one short phrase per empty state or description
- No war or military language — use crew/mob/heist/scheme/lair/hustle framing instead
- Headers, button labels, form fields, and error messages stay plain and functional
- See `CLAUDE.md` for the full voice & tone guidelines

## Reporting Issues

- Use [GitHub Issues](https://github.com/llrowat/goblin-mob-boss/issues) to report bugs or request features
- Include steps to reproduce for bug reports
- Check existing issues before creating a new one

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
