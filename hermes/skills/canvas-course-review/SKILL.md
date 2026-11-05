---
name: canvas-course-review
description: Review a Canvas course's structure and content through the local READ ONLY Canvas Command Center proxy and write findings for human review. Never modifies Canvas.
version: 0.1.0
metadata:
  hermes:
    tags: [canvas, lms, course-review, education]
    category: education
---

# Canvas Course Review (READ ONLY)

## When to Use

Use this skill when the user asks to review, audit, summarize, or compare Canvas
courses — for example: "find unpublished items in course 12345", "list modules
with no pages", "compare the module structure of these two sections", or
"check that every assignment has a due date".

## Setup Assumptions

- The Canvas Command Center proxy is running on this computer at
  `http://127.0.0.1:8787` (`node proxy/server.js` from the repository).
- The proxy holds the Canvas token. **You never need, request, print, or store
  the Canvas token.** If a user pastes a token into chat, tell them to revoke
  it and put it only in `proxy/.env`.
- The proxy only allows GET requests to an allowlist of endpoints. Any request
  that would change Canvas will be refused — that is intended.

## Procedure

1. Confirm the proxy is up:
   `curl -s http://127.0.0.1:8787/health`
   Expect `{"ok":true,"mode":"read-only",...}`. If it fails, ask the user to
   start the proxy; do not try to call Canvas directly.
2. Get the course list (add `all=1` to follow Canvas pagination):
   `curl -s "http://127.0.0.1:8787/api/v1/courses?enrollment_state=active&per_page=100&all=1"`
   Use the real `id` values returned. Never guess course IDs.
3. Pull what the question needs for one course `<id>`:
   - Course: `/api/v1/courses/<id>`
   - Modules + items: `/api/v1/courses/<id>/modules?include[]=items&per_page=100&all=1`
   - Pages: `/api/v1/courses/<id>/pages?per_page=100&all=1`
   - One page body: `/api/v1/courses/<id>/pages/<page_url>`
   - Assignments: `/api/v1/courses/<id>/assignments?per_page=100&all=1`
   - Discussions: `/api/v1/courses/<id>/discussion_topics?per_page=100&all=1`
   - Quizzes (Classic): `/api/v1/courses/<id>/quizzes?per_page=100&all=1`
   - Files: `/api/v1/courses/<id>/files?per_page=100&all=1`
4. Analyze. Useful checks:
   - Items/modules where `published` is false.
   - Assignments with no `due_at`, or `points_possible` of 0/null.
   - Modules with zero items; pages not linked from any module.
   - Naming inconsistencies (e.g., "Week 1" vs "Wk 2").
5. Write findings to a Markdown report (e.g. `course-review_<id>_v1.md`) with a
   table of findings and a separate "Proposed changes" section. Proposed changes
   are suggestions only; label each one **MODIFIES CANVAS** so a human can
   review and apply it.

## Pitfalls

- A 401 means the token expired; a 403 may be a role permission limit or rate
  limiting; a 404 may mean the feature (e.g., Pages) is disabled in that course.
- New Quizzes are not returned by `/quizzes`; say so rather than reporting "no quizzes".
- Do not include student names, grades, or submissions in any report.

## Verification

- Every course/module/page ID in the report came from an API response in this session.
- The report states which endpoints were queried and when.
- No Canvas write was attempted.
