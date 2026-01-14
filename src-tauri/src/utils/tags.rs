use lazy_static::lazy_static;
use regex::Regex;
use sha2::{Digest, Sha256};

lazy_static! {
    // Match hashtags: # followed by letter, then alphanumeric/underscore/hyphen
    // Must be preceded by start of line or non-alphanumeric character
    static ref HASHTAG_REGEX: Regex = Regex::new(r"(?:^|[^a-zA-Z0-9])#([a-zA-Z][a-zA-Z0-9_-]*)").unwrap();

    // Match fenced code blocks (```...```)
    static ref CODE_BLOCK_REGEX: Regex = Regex::new(r"```[\s\S]*?```").unwrap();

    // Match inline code (`...`)
    static ref INLINE_CODE_REGEX: Regex = Regex::new(r"`[^`\n]+`").unwrap();
}

/// Extract inline hashtags from markdown content, excluding code blocks
pub fn extract_inline_tags(content: &str) -> Vec<String> {
    // Remove code blocks and inline code first
    let clean = CODE_BLOCK_REGEX.replace_all(content, "");
    let clean = INLINE_CODE_REGEX.replace_all(&clean, "");

    let mut tags: Vec<String> = HASHTAG_REGEX
        .captures_iter(&clean)
        .map(|cap| cap[1].to_lowercase())
        .collect();

    // Sort and deduplicate
    tags.sort();
    tags.dedup();
    tags
}

/// Compute SHA-256 hash of content for change detection
pub fn compute_content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_inline_tags() {
        let content = "Hello #world this is a #test-tag and #another_tag";
        let tags = extract_inline_tags(content);
        assert_eq!(tags, vec!["another_tag", "test-tag", "world"]);
    }

    #[test]
    fn test_ignores_code_blocks() {
        let content = "Regular #tag\n```\n#ignored\n```\nAnother #visible";
        let tags = extract_inline_tags(content);
        assert_eq!(tags, vec!["tag", "visible"]);
    }

    #[test]
    fn test_ignores_inline_code() {
        let content = "A #real tag and `#fake` tag";
        let tags = extract_inline_tags(content);
        assert_eq!(tags, vec!["real"]);
    }

    #[test]
    fn test_tag_must_start_with_letter() {
        let content = "#valid #123invalid #_invalid";
        let tags = extract_inline_tags(content);
        assert_eq!(tags, vec!["valid"]);
    }

    #[test]
    fn test_content_hash() {
        let hash = compute_content_hash("hello world");
        assert_eq!(hash.len(), 64); // SHA-256 produces 64 hex chars
    }
}
