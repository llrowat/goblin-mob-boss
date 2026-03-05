use std::fs;
use std::path::Path;

pub fn generate_context_pack(worktree_path: &str, repo_path: &str, keywords: &[&str]) -> Result<(), String> {
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
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "__pycache__" {
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
