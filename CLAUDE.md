# CLAUDE-master.md

Master reference for cross-project guidance. Copy relevant sections to project-specific CLAUDE.md files as needed.

---

## Beads Issue Tracker

**Always use beads (`bd`) for tracking work.** Before starting any multi-step task, create beads issues. As you work, update their status.

```bash
bd ready                    # See what's ready to work on
bd create "Task title"      # Create a new issue
bd update <id> --status in_progress  # Mark as started
bd close <id>               # Mark as done
bd sync                     # Commit beads changes
```

If you find yourself doing work without tracking it in beads, STOP and create the issues first.

### Project Setup

When starting a new project:
1. Run `bd init` to initialize the beads database
2. Commit the `.beads/`, `.gitattributes`, and `AGENTS.md` files
3. Run `bd doctor --fix` to resolve setup issues

### When to Use Beads vs TodoWrite

- **Use beads** for: Multi-step tasks, work spanning sessions, tasks with dependencies, discovered work, anything needing tracking
- **Use TodoWrite** only for: Simple single-session execution checklists that don't need persistence

### Core Workflow

**Finding work:**
```bash
bd ready                    # Show issues ready to work (no blockers)
bd list --status=open       # All open issues
bd show <id>                # View issue details with dependencies
```

**Creating issues:**
```bash
bd create "Issue title"                           # Basic task
bd create "Bug title" -t bug -p 1                 # Bug with priority (0-4, 0=critical)
bd create "Feature" -t feature -d "Description"  # Feature with description
bd q "Quick issue"                                # Quick capture, returns only ID
```

**Working on issues:**
```bash
bd update <id> --status in_progress   # Claim work
bd update <id> --status open          # Release work
bd close <id>                         # Complete work
bd close <id> --reason "explanation"  # Close with reason
```

**Dependencies:**
```bash
bd dep add <issue> <depends-on>       # issue depends on depends-on
bd dep <blocker> --blocks <blocked>   # blocker blocks blocked
bd blocked                            # Show all blocked issues
bd dep tree <id>                      # Visualize dependency tree
```

**Epics and hierarchy:**
```bash
bd create "Epic title" -t epic                    # Create epic
bd create "Subtask" --parent <epic-id>            # Create child of epic
bd list --parent <epic-id>                        # List children
bd epic status <epic-id>                          # Show completion status
```

**Comments:**
```bash
bd comments <id>                      # View comments
bd comments add <id> "Comment text"   # Add comment
```

### Priority Levels

- P0: Critical/urgent
- P1: High priority
- P2: Medium (default)
- P3: Low priority
- P4: Backlog

### Issue Types

`bug`, `feature`, `task`, `epic`, `chore`, `merge-request`

### Creating Issues Proactively

Create beads issues when:
- User requests a multi-step task → create issue(s) for each step
- You discover work that needs doing → `bd create` with discovered-from dependency
- A task is blocked by something → create the blocker and add dependency
- Work should be tracked across sessions → always use beads

---

## Git Repository Location

Always clone or create git repositories in `~/git`.

---

## Working Directory Rules

- **One-off tasks**: Always use `~/git/claude` as the working directory for one-off tasks, scripts, or experiments unless already in a folder with an existing repo or app.
- **Never drop random files into `~/`**: Do not create files directly in the home directory. Use appropriate project folders.

---

## Virtual Environments (Python)

**CRITICAL: ALWAYS create and activate a virtual environment BEFORE running `pip install` or installing ANY Python packages.**

This is NON-NEGOTIABLE. Do NOT skip this step. Do NOT install packages globally.

### Required Steps (in order)

```bash
# 1. Create the venv FIRST
python -m venv venv

# 2. Activate it BEFORE any pip commands
source venv/bin/activate  # or: . venv/bin/activate

# 3. ONLY THEN install packages
pip install <package>
```

### Why This Matters

- Installing packages globally pollutes the system Python
- It causes version conflicts across projects
- It makes environments unreproducible

### Checklist Before Any `pip install`

1. Am I in a project directory? (Not `~/`)
2. Does a `venv/` folder exist? If not, create one.
3. Is the venv activated? (`which python` should show the venv path)
4. Only NOW run pip install.

**If you skip the venv step, you are violating a direct user instruction.**

---

## Session End Protocol

Before ending any session, run this checklist:

```bash
git status                  # Check what changed
git add <files>             # Stage code changes
bd sync                     # Commit beads changes
git commit -m "..."         # Commit code
bd sync                     # Commit any new beads changes
git push                    # Push to remote
```

**Work is NOT complete until `git push` succeeds.**

---

## Development Flow Pattern

1. Break down feature into specific steps
2. Analyze existing code, identify exact changes (files, functions, variables)
3. Create execution plan with specific changes
4. Implement without asking for confirmation on every change
5. Write unit tests and ensure they pass
6. Iterate and refine as needed
7. Run build, test, lint commands and fix until they pass
8. Review that all functionality is fully implemented

### Additional Guidelines

- Detect if current feature is configured in `.claude/devplan_current_feature.md` - if present, it contains current focus
- Consult `.claude/devplan_repo_overview.md` for repository context if present
- Do not ask user to confirm code changes - proceed with implementation until feature is complete
- After implementation, verify all required functionality is fully implemented

---

## Testing Standards

- **Real integration tests** — No mocks, actual DB + API calls where applicable
- **60-120s timeouts** for slow operations (LLM, network)
- **Specific assertions** — Not just "toBeDefined"
- **Code without tests is not complete**

### Test Naming

```typescript
// Good
it('should extract high-salience mentions for PTSD story with sleep apnea indicators')

// Bad
it('extraction works')
```

---

## Documentation Updates

Only update docs for **structurally significant** changes:
- Project milestones → update docs
- Don't update for minor bug fixes or refactors

---

## Railway Deployments

See `~/.claude/skills/railway-deployment.md` for detailed Railway CLI usage.

Key points:
- Use `-y` flag for non-interactive commands (e.g., `railway redeploy -s <service> -y`)
- For monorepos: add `postinstall` script to install subdirectory dependencies
- Railway uses Railpack (not Nixpacks) - `nixpacks.toml` may not work

### Deploying and Verifying

**DO NOT use `railway up` when a project auto-deploys from git.** `railway up` uploads local files and creates a SEPARATE deployment that may mask failed git-triggered deploys. If the project has GitHub integration, just `git push` and verify the git-triggered deployment.

**Always verify deployments using `railway deployment list`:**

```bash
# List recent deployments with statuses
railway deployment list

# Check build logs for a SPECIFIC deployment (by ID)
railway logs --build <DEPLOYMENT_ID> -n 50

# Check deploy/runtime logs for a specific deployment
railway logs --deployment <DEPLOYMENT_ID> -n 50

# Check latest build logs (defaults to most recent SUCCESSFUL deployment — misleading if latest failed!)
railway logs --build -n 50
```

**Correct workflow after pushing:**
1. `git push origin main`
2. `railway deployment list` — find the new deployment, confirm it shows BUILDING
3. Wait, then re-run `railway deployment list` — confirm it shows SUCCESS
4. If FAILED: `railway logs --build <FAILED_DEPLOYMENT_ID> -n 100` to see the error

**WARNING:** `railway logs --build` without a deployment ID shows the most recent SUCCESSFUL build, not the latest overall. If the latest deployment failed, you'll see an OLD deployment's logs and incorrectly conclude the build passed.

### Non-Interactive Flags

Railway CLI supports fully non-interactive operation:

```bash
# Service selection
railway up --service <service-name-or-id>
railway redeploy --service <service-name-or-id> -y
railway link --service <service-name> --project <project-name>

# For CI/CD environments
railway up --service=<SERVICE_ID> --ci
```

The `--ci` flag ensures non-interactive mode. Always use explicit `--service` and `--project` flags instead of relying on interactive prompts.

```bash
# Get variables from a specific service
railway variables --service <service-name>

# Run command with service context
railway run --service <service-name> <command>
```

---

## Airtable MCP

The Airtable MCP server is configured as READ-ONLY. Never attempt to:
- Create, update, or delete records
- Create or modify tables
- Create or modify fields

Only use: `list_bases`, `list_tables`, `describe_table`, `list_records`, `search_records`, `get_record`

---

## MCP Authentication Patterns

### OAuth (Automatic)

Claude Code automatically handles the complete OAuth 2.0 flow for SSE and HTTP servers. No additional auth configuration needed.

### Token-Based Authentication

**Bearer Tokens:**
```json
{
  "headers": {
    "Authorization": "Bearer ${API_TOKEN}"
  }
}
```

**API Keys:**
```json
{
  "headers": {
    "X-API-Key": "${API_KEY}"
  }
}
```

### Security Best Practices

**DO:**
- Use environment variables for tokens
- Document required variables in README
- Use HTTPS/WSS always
- Let OAuth handle authentication when available

**DON'T:**
- Hardcode tokens in configuration
- Commit tokens to git
- Use HTTP instead of HTTPS
- Log tokens or sensitive headers

---

## Agent Documentation Standard

When creating agent documentation, use this structure:

| Guide | When to Read | Purpose |
|-------|--------------|---------|
| `.agents/beads.md` | Always | Issue tracking with beads |
| `.agents/project-workflow.md` | Starting a feature | Project structure and workflow |

Run `just` to see all available development commands.
