use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A guidance note that users can add mid-execution to steer the agent.
/// Written to a file that Claude Code can read during execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuidanceNote {
    pub id: String,
    pub content: String,
    pub priority: GuidancePriority,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum GuidancePriority {
    Info,
    Important,
    Critical,
}

/// Add a guidance note to the feature's guidance file.
/// Notes accumulate in .gmb/features/{feature_id}/guidance.md which is
/// referenced in the system prompt so agents can read it.
pub fn add_guidance_note(
    repo_path: &str,
    feature_id: &str,
    content: &str,
    priority: GuidancePriority,
) -> Result<GuidanceNote, String> {
    let feature_dir = Path::new(repo_path)
        .join(".gmb")
        .join("features")
        .join(feature_id);
    std::fs::create_dir_all(&feature_dir)
        .map_err(|e| format!("Failed to create feature dir: {}", e))?;

    let note = GuidanceNote {
        id: uuid::Uuid::new_v4().to_string(),
        content: content.to_string(),
        priority,
        created_at: Utc::now(),
    };

    // Append to guidance.md
    let guidance_path = feature_dir.join("guidance.md");
    let prefix = match &note.priority {
        GuidancePriority::Info => "NOTE",
        GuidancePriority::Important => "IMPORTANT",
        GuidancePriority::Critical => "CRITICAL",
    };
    let entry = format!(
        "\n## [{prefix}] {time}\n\n{content}\n",
        prefix = prefix,
        time = note.created_at.format("%Y-%m-%d %H:%M:%S UTC"),
        content = note.content,
    );

    let mut existing = if guidance_path.exists() {
        std::fs::read_to_string(&guidance_path).unwrap_or_default()
    } else {
        "# Guidance Notes\n\nThe user has added the following guidance during execution. Read and follow these instructions.\n".to_string()
    };
    existing.push_str(&entry);

    std::fs::write(&guidance_path, &existing)
        .map_err(|e| format!("Failed to write guidance file: {}", e))?;

    // Also append to notes.json for structured access
    let notes_path = feature_dir.join("guidance-notes.json");
    let mut notes: Vec<GuidanceNote> = if notes_path.exists() {
        std::fs::read_to_string(&notes_path)
            .ok()
            .and_then(|data| serde_json::from_str(&data).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };
    notes.push(note.clone());
    if let Ok(json) = serde_json::to_string_pretty(&notes) {
        let _ = std::fs::write(&notes_path, json);
    }

    Ok(note)
}

/// List all guidance notes for a feature.
pub fn list_guidance_notes(repo_path: &str, feature_id: &str) -> Result<Vec<GuidanceNote>, String> {
    let notes_path = Path::new(repo_path)
        .join(".gmb")
        .join("features")
        .join(feature_id)
        .join("guidance-notes.json");

    if !notes_path.exists() {
        return Ok(vec![]);
    }

    let data = std::fs::read_to_string(&notes_path)
        .map_err(|e| format!("Failed to read guidance notes: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse guidance notes: {}", e))
}

/// Get the guidance file path for inclusion in system prompts.
pub fn guidance_file_path(repo_path: &str, feature_id: &str) -> String {
    Path::new(repo_path)
        .join(".gmb")
        .join("features")
        .join(feature_id)
        .join("guidance.md")
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_feature_dir(dir: &TempDir, feature_id: &str) {
        let feature_dir = dir.path().join(".gmb").join("features").join(feature_id);
        std::fs::create_dir_all(&feature_dir).unwrap();
    }

    #[test]
    fn add_guidance_note_creates_files() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();
        let feature_id = "feat-1";

        let note = add_guidance_note(
            &repo_path,
            feature_id,
            "Focus on the login flow",
            GuidancePriority::Important,
        )
        .unwrap();
        assert_eq!(note.content, "Focus on the login flow");
        assert_eq!(note.priority, GuidancePriority::Important);

        // Check guidance.md exists
        let guidance_path = dir
            .path()
            .join(".gmb")
            .join("features")
            .join(feature_id)
            .join("guidance.md");
        assert!(guidance_path.exists());
        let content = std::fs::read_to_string(&guidance_path).unwrap();
        assert!(content.contains("Focus on the login flow"));
        assert!(content.contains("[IMPORTANT]"));

        // Check notes.json exists
        let notes_path = dir
            .path()
            .join(".gmb")
            .join("features")
            .join(feature_id)
            .join("guidance-notes.json");
        assert!(notes_path.exists());
    }

    #[test]
    fn add_multiple_notes_appends() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_string_lossy().to_string();

        add_guidance_note(&repo_path, "feat-1", "First note", GuidancePriority::Info).unwrap();
        add_guidance_note(
            &repo_path,
            "feat-1",
            "Second note",
            GuidancePriority::Critical,
        )
        .unwrap();

        let notes = list_guidance_notes(&repo_path, "feat-1").unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].content, "First note");
        assert_eq!(notes[1].content, "Second note");

        let guidance_path = dir
            .path()
            .join(".gmb")
            .join("features")
            .join("feat-1")
            .join("guidance.md");
        let content = std::fs::read_to_string(&guidance_path).unwrap();
        assert!(content.contains("[NOTE]"));
        assert!(content.contains("[CRITICAL]"));
    }

    #[test]
    fn list_guidance_notes_empty_when_no_file() {
        let dir = TempDir::new().unwrap();
        setup_feature_dir(&dir, "feat-1");
        let notes = list_guidance_notes(&dir.path().to_string_lossy(), "feat-1").unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn guidance_file_path_correct() {
        let path = guidance_file_path("/my/repo", "feat-1");
        assert!(path.contains(".gmb"));
        assert!(path.contains("feat-1"));
        assert!(path.ends_with("guidance.md"));
    }

    #[test]
    fn guidance_priority_serializes() {
        let note = GuidanceNote {
            id: "n1".to_string(),
            content: "test".to_string(),
            priority: GuidancePriority::Critical,
            created_at: Utc::now(),
        };
        let json = serde_json::to_string(&note).unwrap();
        assert!(json.contains("\"critical\""));
        let parsed: GuidanceNote = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.priority, GuidancePriority::Critical);
    }
}
