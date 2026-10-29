---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Every issue carries what "What every issue carries" below says. Ask the human only for
   anything they want on top of it.
5. Create the plan's label once (`gh label create "plan:<plan>"`), then each issue in dependency
   order, so blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --label "plan:<plan>" --body-file <tmp.md>
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

Closing one, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

A pushed commit with `closes #n` closes the issue on its own; then post the closing comment with
`gh issue comment <n>`.

## What every issue carries

Agreed with the human on 2026-10-29 (plan morning-digest). The reviewer sorts issues by the first
line and the label, so keep both exact.

- Label `plan:<plan>`, `<plan>` from `plan.md`'s frontmatter (e.g. `plan:morning-digest`).
- Body, in this order:

  ```md
  Source: plan.md § <n>

  ## Scope

  <what this issue changes, from that section; traps a worker would hit cold>

  ## Done when

  <the plan's done condition for that section, checkable>

  ## Blocked by

  <#n, …, or —; "#n to start" and what "done when" also needs, when they differ>
  ```

- `<n>` is the section as the plan numbers it: `1`, `2a`, `3`. Two issues from one section both
  cite it.
- A done condition that waits on a person (a reviewer has looked, a reply came back) holds only
  once they have answered. Sent is not done: keep the issue open until then.

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.
