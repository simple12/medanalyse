Never use the em dash "—". Use plain dash "-" instead.
When writing commit messages, NEVER auto-add your agent name as co-author.
Never manually modify CHANGELOG.md files or any files that are marked as auto-generated.
When writing or substantially editing long Markdown files, put each full sentence on its own line.
Preserve normal Markdown structure, but avoid wrapping multiple sentences onto one physical line.
After committing or amending, verify the latest message has no Co-authored-by trailer.
If commit tooling reinjects Co-authored-by, rebuild the commit with git commit-tree before pushing.
GitHub Contributors counts historical Co-authored-by trailers. Tip-only fixes do not remove Cursor Agent from that list.
For a clean Contributors graph, use a new repository or an orphan single-commit history.
