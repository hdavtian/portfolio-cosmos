# Verifies a repo's Jira project guard.
#
# Run from the repo root:
#   pwsh .claude\hooks\guard-tests.ps1 -Key HD -ForeignKey OTHERKEY
#
# -Key         the project this repo is allowed to touch
# -ForeignKey  any other project key on the same Jira site, used as the thing that
#              must be refused. Pass a real one from your own site when you run it;
#              it is not recorded here, because the guard denies by default and does
#              not need a list of the projects it is keeping out.
#
# Every case must pass. If one fails, fix the hook -- never loosen the test.

param(
  [Parameter(Mandatory = $true)][string]$Key,
  [Parameter(Mandatory = $true)][string]$ForeignKey,
  [string]$Hook = '.claude\hooks\jira-project-guard.cjs'
)

if (-not (Test-Path $Hook)) { Write-Error "Hook not found at $Hook"; exit 1 }

function Case($name, $json, $expect) {
  [pscustomobject]@{ Name = $name; Json = $json; Expect = $expect }
}

$cases = @(
  # --- the allowed project -------------------------------------------------
  Case "$Key read" "{`"tool_name`":`"mcp__atlassian__getJiraIssue`",`"tool_input`":{`"issueIdOrKey`":`"$Key-1`"}}" 'ALLOW'
  Case "$Key list transitions" "{`"tool_name`":`"mcp__atlassian__listJiraIssueTransitions`",`"tool_input`":{`"issueIdOrKey`":`"$Key-1`"}}" 'ALLOW'
  Case "$Key list comments" "{`"tool_name`":`"mcp__atlassian__listJiraIssueComments`",`"tool_input`":{`"issueIdOrKey`":`"$Key-1`"}}" 'ALLOW'
  Case "$Key comment" "{`"tool_name`":`"mcp__atlassian__addOrEditJiraIssueComment`",`"tool_input`":{`"issueIdOrKey`":`"$Key-1`",`"commentBody`":`"x`"}}" 'ALLOW'
  Case "$Key transition (status only)" "{`"tool_name`":`"mcp__atlassian__transitionJiraIssue`",`"tool_input`":{`"issueIdOrKey`":`"$Key-1`",`"transitionId`":`"31`"}}" 'ALLOW'
  Case "JQL pinned to $Key" "{`"tool_name`":`"mcp__atlassian__searchJiraIssuesUsingJql`",`"tool_input`":{`"jql`":`"project = $Key ORDER BY created DESC`"}}" 'ALLOW'
  Case 'atlassianUserInfo' '{"tool_name":"mcp__atlassian__atlassianUserInfo","tool_input":{}}' 'ALLOW'
  Case 'OAuth handshake' '{"tool_name":"mcp__atlassian__authenticate","tool_input":{}}' 'ALLOW'
  Case 'non-atlassian tool' '{"tool_name":"Bash","tool_input":{"command":"ls"}}' 'ALLOW'

  # --- other projects ------------------------------------------------------
  Case "$ForeignKey read" "{`"tool_name`":`"mcp__atlassian__getJiraIssue`",`"tool_input`":{`"issueIdOrKey`":`"$ForeignKey-1`"}}" 'DENY'
  Case "$ForeignKey comment" "{`"tool_name`":`"mcp__atlassian__addOrEditJiraIssueComment`",`"tool_input`":{`"issueIdOrKey`":`"$ForeignKey-1`",`"commentBody`":`"x`"}}" 'DENY'
  Case "$ForeignKey transition" "{`"tool_name`":`"mcp__atlassian__transitionJiraIssue`",`"tool_input`":{`"issueIdOrKey`":`"$ForeignKey-1`",`"transitionId`":`"31`"}}" 'DENY'

  # --- ways around the prefix check ---------------------------------------
  Case 'bare numeric issue id' '{"tool_name":"mcp__atlassian__getJiraIssue","tool_input":{"issueIdOrKey":"10042"}}' 'DENY'
  Case 'missing issue key' '{"tool_name":"mcp__atlassian__getJiraIssue","tool_input":{}}' 'DENY'
  Case 'unpinned JQL' '{"tool_name":"mcp__atlassian__searchJiraIssuesUsingJql","tool_input":{"jql":"assignee = currentUser()"}}' 'DENY'
  Case 'negated project JQL' "{`"tool_name`":`"mcp__atlassian__searchJiraIssuesUsingJql`",`"tool_input`":{`"jql`":`"project != $Key`"}}" 'DENY'

  # --- scope creep ---------------------------------------------------------
  Case 'transition carrying fields' "{`"tool_name`":`"mcp__atlassian__transitionJiraIssue`",`"tool_input`":{`"issueIdOrKey`":`"$Key-1`",`"transitionId`":`"31`",`"fields`":{`"summary`":`"hijacked`"}}}" 'DENY'
  Case 'transition carrying update' "{`"tool_name`":`"mcp__atlassian__transitionJiraIssue`",`"tool_input`":{`"issueIdOrKey`":`"$Key-1`",`"transitionId`":`"31`",`"update`":{`"summary`":[{`"set`":`"x`"}]}}}" 'DENY'
  Case 'create ticket' '{"tool_name":"mcp__atlassian__createJiraIssue","tool_input":{}}' 'DENY'
  Case 'edit ticket fields' '{"tool_name":"mcp__atlassian__editJiraIssue","tool_input":{"issueIdOrKey":"X-1"}}' 'DENY'
  Case 'list all projects' '{"tool_name":"mcp__atlassian__getVisibleJiraProjects","tool_input":{}}' 'DENY'

  # --- the generic bypasses ------------------------------------------------
  Case 'discover' '{"tool_name":"mcp__atlassian__discover","tool_input":{"goal":"read any issue"}}' 'DENY'
  Case 'executeRead at foreign issue' "{`"tool_name`":`"mcp__atlassian__executeRead`",`"tool_input`":{`"name`":`"getJiraIssue`",`"inputs`":{`"issueIdOrKey`":`"$ForeignKey-1`"}}}" 'DENY'
  Case 'executeWrite' '{"tool_name":"mcp__atlassian__executeWrite","tool_input":{"name":"editJiraIssue"}}' 'DENY'
  Case 'executeDestructive' '{"tool_name":"mcp__atlassian__executeDestructive","tool_input":{"name":"deleteJiraIssue"}}' 'DENY'
  Case 'generic fetch' '{"tool_name":"mcp__atlassian__fetch","tool_input":{"url":"https://x.atlassian.net/browse/Y-1"}}' 'DENY'

  # --- out of scope products ----------------------------------------------
  Case 'confluence search' '{"tool_name":"mcp__atlassian__searchConfluence","tool_input":{"query":"x"}}' 'DENY'
  Case 'teamwork graph' '{"tool_name":"mcp__atlassian__getGraphContext","tool_input":{}}' 'DENY'
  Case 'loom' '{"tool_name":"mcp__atlassian__getLoomVideo","tool_input":{}}' 'DENY'

  # --- unknown tool: deny-by-default must catch it -------------------------
  Case 'invented future tool' '{"tool_name":"mcp__atlassian__someToolAddedNextYear","tool_input":{}}' 'DENY'

  # --- fail closed ---------------------------------------------------------
  Case 'malformed payload' 'not json at all' 'DENY'
)

$fail = 0
foreach ($c in $cases) {
  $decision = ($c.Json | node $Hook | ConvertFrom-Json).hookSpecificOutput.permissionDecision
  if (-not $decision) { $decision = 'NONE' }
  $decision = $decision.ToUpper()
  if ($decision -eq $c.Expect) {
    "{0,-34} expect {1,-5} got {2,-5} ok" -f $c.Name, $c.Expect, $decision
  } else {
    $fail++
    "{0,-34} expect {1,-5} got {2,-5} FAIL" -f $c.Name, $c.Expect, $decision
  }
}

""
if ($fail) {
  "$fail of $($cases.Count) FAILED"
  exit 1
}
"all $($cases.Count) cases pass"

# The override is deliberately not covered here: it depends on file mtime, and a test
# that creates .claude/jira-unlock would leave a live unlock behind if it crashed
# midway. Check it by hand when changing that code path.
