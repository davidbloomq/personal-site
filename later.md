# Later

Ideas for future features. One entry per feature; enough detail that it can be picked up cold.

## Annotations (inline comments on posts)

**Status: built, then retired (2026-06-11).** A complete working implementation — spec, Cloudflare Worker + D1 API, frontend — is archived on branch `archive/annotations`; see "Retired features" in CLAUDE.md for how to bring it back. The notes below are the original idea, kept for context.

Readers can comment on essays by highlighting a portion of text and attaching a comment to it, Google-Docs style.

- **Highlight-to-comment**: select text in a post → option to write a comment anchored to that selection.
- **Reply threads**: each comment supports threaded replies.
- **Global toggle**: readers can toggle all comments on/off for a post.
- **Per-thread toggle**: a specific comment/thread can be individually hidden.
- **Author identity**: David can comment in a way that visibly marks the comment as coming from the author.
- **Lightweight names**: commenters get a simple, seamless option to add a name to each comment — not a profile or account, just an optional per-comment name field. If no name is given, don't display one — instead assign the commenter a number (e.g. "#3") so it's still visible who is replying to whom within threads.
