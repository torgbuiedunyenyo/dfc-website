# Work log

## 2026-11-16 — category controls started
- Objective: let editors choose the archive section during Current-to-Past moves and change it in project details.
- Existing untracked DFC_CL_26Feb/ is untouched. No production content edits authorized in this step.
- Plan: replace title prompt with title/category dialog; save selected category; add details dropdown; test real API/browser; push and verify.
- Follow-ups outside scope: categorize existing shows; repair workshop image placement/editor insertion behavior.
- Tracking limitation: bd command is not installed.

## Implementation checkpoint
- Added title/category move dialog and category dropdown in project details, preserving custom categories and explicit uncategorized selection.
- Move API defaults omitted category to Exhibitions + Residencies; snapshots retain the selection.
- 25 fast tests passed; Vercel build passed (CLI printed a rewrite-parser diagnostic but exited successfully); syntax and diff checks passed. No lint script exists.
- Integration suite running as process session 81854; production content untouched.

## Verification checkpoint
- Both new real database/browser tests pass, including archive placement, details changes, content preservation, history, default category and explicit uncategorized behavior.
- First full integration run: 11 passed, 2 existing tests timed out waiting for external fonts (`document.fonts.ready`), before their assertions. Restarted the test browser; rerunning full suite in session 87560. No application failure identified.

## Test reliability checkpoint
- Bounded external-font wait to 10 seconds; both existing save tests then passed.
- New browser test passes alone but initially raced the preceding expired-session test's asynchronous discard reload. Added a fresh browser session boundary for the new test; full suite rerun in session 95912.

## Browser isolation correction
- Fresh-session cookie injection after the expired-session test still landed on login. Replaced injection in the new UI test with actual local admin login, making the test independent and exercising the normal entry flow. Full rerun: session 4579.

## Integration isolation
- New category test passes independently. Moved category tests to their own integration file, browser session and disposable database so they cannot inherit session-expiration/navigation state from the existing suite. Combined integration run in session 62512.

## Ready to publish
- Full suite passes: 25 fast tests, 13 real database/browser integration tests; Vercel build and syntax checks pass. No lint script is configured.
- All application changes are category controls/defaulting only. Existing show categories and workshop repair remain pending separate authorization.
- Next external action: commit and push main to trigger normal Vercel deployment, then verify deployed assets. No manual deployment.

## Published and verified
- Commit 3d01938 pushed successfully to origin/main. Git-triggered production deployment dpl_3PTyqp57WDq43dWrgnD1Xcyiox26 is Ready and aliases both dreamfarmcommons.com hostnames.
- Live /admin/admin.js returned 200 and exactly matches the tested file, including both category selectors.
- No production content writes performed. Follow-ups remain existing uncategorized shows and workshop repair; not part of this authorization.
- All test processes completed and their browsers/databases closed by teardown. Original untracked backup remains untouched. bd unavailable, so this log records follow-ups.
