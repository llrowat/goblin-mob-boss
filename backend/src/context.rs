use std::fs;
use std::path::Path;

pub fn generate_context_pack(
    worktree_path: &str,
    repo_path: &str,
    keywords: &[&str],
) -> Result<(), String> {
    let context_dir = Path::new(worktree_path).join(".gmb").join("context");
    fs::create_dir_all(&context_dir).map_err(|e| format!("Failed to create context dir: {}", e))?;

    // Generate repo map
    let repo_map = generate_repo_map(repo_path)?;
    fs::write(context_dir.join("repo_map.md"), repo_map)
        .map_err(|e| format!("Failed to write repo_map.md: {}", e))?;

    // Generate related files
    let related = generate_related_files(repo_path, keywords)?;
    fs::write(context_dir.join("related_files.md"), related)
        .map_err(|e| format!("Failed to write related_files.md: {}", e))?;

    Ok(())
}

fn generate_repo_map(repo_path: &str) -> Result<String, String> {
    let mut map = String::from("# Repository Map\n\n");

    // Detect languages and frameworks
    let indicators = vec![
        ("package.json", "JavaScript/TypeScript (Node.js)"),
        ("Cargo.toml", "Rust"),
        ("go.mod", "Go"),
        ("requirements.txt", "Python"),
        ("pyproject.toml", "Python"),
        ("Gemfile", "Ruby"),
        ("pom.xml", "Java (Maven)"),
        ("build.gradle", "Java/Kotlin (Gradle)"),
    ];

    map.push_str("## Languages & Frameworks\n\n");
    for (file, lang) in &indicators {
        if Path::new(repo_path).join(file).exists() {
            map.push_str(&format!("- {} (detected via `{}`)\n", lang, file));
        }
    }
    map.push('\n');

    // List top-level directories
    map.push_str("## Top-Level Structure\n\n");
    if let Ok(entries) = fs::read_dir(repo_path) {
        let mut dirs: Vec<String> = Vec::new();
        let mut files: Vec<String> = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "__pycache__"
            {
                continue;
            }
            if entry.path().is_dir() {
                dirs.push(name);
            } else {
                files.push(name);
            }
        }
        dirs.sort();
        files.sort();
        for d in &dirs {
            map.push_str(&format!("- `{}/`\n", d));
        }
        for f in &files {
            map.push_str(&format!("- `{}`\n", f));
        }
    }

    Ok(map)
}

fn generate_related_files(repo_path: &str, keywords: &[&str]) -> Result<String, String> {
    let mut content = String::from("# Related Files\n\n");
    content.push_str("Files matching task keywords:\n\n");

    let files = crate::git::grep_files(repo_path, keywords).unwrap_or_default();
    if files.is_empty() {
        content.push_str("_No matching files found._\n");
    } else {
        for file in files.iter().take(20) {
            content.push_str(&format!("- `{}`\n", file));
        }
        if files.len() > 20 {
            content.push_str(&format!("\n_...and {} more files_\n", files.len() - 20));
        }
    }

    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn generate_repo_map_detects_rust_project() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("Cargo.toml"), "[package]").unwrap();
        fs::create_dir(dir.path().join("src")).unwrap();

        let map = generate_repo_map(&dir.path().to_string_lossy()).unwrap();
        assert!(map.contains("Rust"));
        assert!(map.contains("Cargo.toml"));
        assert!(map.contains("`src/`"));
    }

    #[test]
    fn generate_repo_map_detects_node_project() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("package.json"), "{}").unwrap();
        fs::create_dir(dir.path().join("frontend")).unwrap();

        let map = generate_repo_map(&dir.path().to_string_lossy()).unwrap();
        assert!(map.contains("JavaScript/TypeScript (Node.js)"));
        assert!(map.contains("`frontend/`"));
    }

    #[test]
    fn generate_repo_map_excludes_hidden_and_build_dirs() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::create_dir(dir.path().join("node_modules")).unwrap();
        fs::create_dir(dir.path().join("target")).unwrap();
        fs::create_dir(dir.path().join("src")).unwrap();

        let map = generate_repo_map(&dir.path().to_string_lossy()).unwrap();
        assert!(!map.contains(".git"));
        assert!(!map.contains("node_modules"));
        assert!(!map.contains("target"));
        assert!(map.contains("`src/`"));
    }

    #[test]
    fn generate_related_files_empty_when_no_matches() {
        let dir = TempDir::new().unwrap();
        let content = generate_related_files(&dir.path().to_string_lossy(), &["nonexistent"]).unwrap();
        assert!(content.contains("No matching files found"));
    }

    #[test]
    fn generate_repo_map_lists_files_and_dirs_sorted() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("README.md"), "# Hello").unwrap();
        fs::write(dir.path().join("Makefile"), "all:").unwrap();
        fs::create_dir(dir.path().join("docs")).unwrap();
        fs::create_dir(dir.path().join("api")).unwrap();

        let map = generate_repo_map(&dir.path().to_string_lossy()).unwrap();
        assert!(map.contains("`README.md`"));
        assert!(map.contains("`docs/`"));
        // Directories come before files in the output
        let api_pos = map.find("`api/`").unwrap();
        let readme_pos = map.find("`README.md`").unwrap();
        assert!(api_pos < readme_pos, "dirs should appear before files");
    }
}
