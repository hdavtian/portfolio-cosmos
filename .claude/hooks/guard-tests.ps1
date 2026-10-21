# Merged from C:\sites\hydrodent\.claude\hooks\guard-tests.ps1 (61 cases), resume-tweaks (strict JQL, cloudId) and grishdavtian (full write).
# Verifies a repo's Jira project guard.
#
# Run from the repo root:
#   pwsh .claude\hooks\guard-tests.ps1 -Key ABC -ForeignKey XYZ -Access comment `
#        -Cloud <cloudId> -Site yoursite.atlassian.net
#
# -Key         the project this repo is allowed to touch
# -ForeignKey  any other project key on the same Jira site, used as the thing
#              that must be refused. Pick a real one.
# -Access      the level the hook was installed with: read | comment | create | full
# -Cloud/-Site the values written into the hook's CLOUD_ID / SITE_HOST
#
# Every case must pass. If one fails, fix the hook -- never loosen the test.

param(
  [Parameter(Mandatory = $true)][string]$Key,
  [Parameter(Mandatory = $true)][string]$ForeignKey,
  [Parameter(Mandatory = $true)][ValidateSet('read', 'comment', 'create', 'full')][string]$Access,
  [Parameter(Mandatory = $true)][string]$Cloud,
  [Parameter(Mandatory = $true)][string]$Site,
  [string]$Hook = '.claude\hooks\jira-project-guard.cjs'
)

if (-not (Test-Path $Hook)) { Write-Error "Hook not found at $Hook"; exit 1 }

$levels = @('read', 'comment', 'create', 'full')
$have = $levels.IndexOf($Access)

# Build a payload. cloudId is added unless the input sets it (use $null to omit it).
function P([string]$tool, [hashtable]$in = @{}) {
  $i = @{}
  if (-not $in.ContainsKey('cloudId')) { $i['cloudId'] = $Cloud }
  foreach ($k in $in.Keys) { if ($null -ne $in[$k]) { $i[$k] = $in[$k] } }
  @{ tool_name = $tool; tool_input = $i } | ConvertTo-Json -Compress -Depth 10
}
function A([string]$short, [hashtable]$in = @{}) { P "mcp__atlassian__$short" $in }

# Expect ALLOW only at or above a level; 'never' / 'always' for fixed outcomes.
function Case($name, $json, $min) {
  $expect = switch ($min) {
    'always' { 'ALLOW' }
    'never' { 'DENY' }
    default { if ($have -ge $levels.IndexOf($min)) { 'ALLOW' } else { 'DENY' } }
  }
  [pscustomobject]@{ Name = $name; Json = $json; Expect = $expect }
}

$K1 = "$Key-1"; $K2 = "$Key-2"; $F1 = "$ForeignKey-1"

$cases = @(
  # --- the allowed project -------------------------------------------------
  Case "$Key read" (A getJiraIssue @{ issueIdOrKey = $K1 }) 'read'
  Case "JQL pinned to $Key" (A searchJiraIssuesUsingJql @{ jql = "project = $Key ORDER BY created DESC" }) 'read'
  Case "JQL quoted + AND + ORDER" (A searchJiraIssuesUsingJql @{ jql = "project = `"$Key`" AND status in (Done, `"To Do`") ORDER BY created DESC" }) 'read'
  Case "$Key comment" (A addOrEditJiraIssueComment @{ issueIdOrKey = $K1; commentBody = 'x' }) 'comment'
  Case "$Key transition (status only)" (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31' }) 'comment'
  Case "$Key transition by name" (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionName = 'Done' }) 'comment'
  Case "$Key create task" (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Task'; labels = @('a'); priority = 'Medium' }) 'create'
  Case "$Key create subtask" (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Subtask'; parent = $K1 }) 'create'
  Case "$Key edit" (A editJiraIssue @{ issueIdOrKey = $K1; fields = @{ summary = 'x' } }) 'full'
  Case "$Key edit, no fields" (A editJiraIssue @{ issueIdOrKey = $K1 }) 'full'
  Case "$Key edit rank within project" (A editJiraIssue @{ issueIdOrKey = $K1; rankBeforeIssue = $K2 }) 'full'
  Case "$Key edit, parent within project" (A editJiraIssue @{ issueIdOrKey = $K1; fields = @{ parent = @{ key = $K2 } } }) 'full'
  Case "$Key transition with fields" (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31'; fields = @{ resolution = @{ name = 'Done' } } }) 'full'
  Case "$Key transition with update" (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31'; update = @{ summary = @(@{ set = 'x' }) } }) 'full'
  Case "$Key create with additional_fields" (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Task'; additional_fields = @{ duedate = '2030-01-01' } }) 'full'
  Case 'atlassianUserInfo' (A atlassianUserInfo) 'always'
  Case 'OAuth handshake' (P 'mcp__atlassian__authenticate' @{ cloudId = $null }) 'always'
  Case 'non-atlassian tool' '{"tool_name":"Bash","tool_input":{"command":"ls"}}' 'always'

  # --- other projects ------------------------------------------------------
  Case "$ForeignKey read" (A getJiraIssue @{ issueIdOrKey = $F1 }) 'never'
  Case "$ForeignKey comment" (A addOrEditJiraIssueComment @{ issueIdOrKey = $F1; commentBody = 'x' }) 'never'
  Case "$ForeignKey transition" (A transitionJiraIssue @{ issueIdOrKey = $F1; transitionId = '31' }) 'never'
  Case "$ForeignKey create" (A createJiraIssue @{ projectKey = $ForeignKey; summary = 'x'; issueType = 'Task' }) 'never'
  Case "$ForeignKey edit" (A editJiraIssue @{ issueIdOrKey = $F1; fields = @{ summary = 'x' } }) 'never'

  # --- reaching across from an allowed issue -------------------------------
  Case "create, $ForeignKey parent" (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Subtask'; parent = $F1 }) 'never'
  Case 'create, numeric parent' (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Subtask'; parent = '10004' }) 'never'
  Case 'create, project via additional_fields' (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Task'; additional_fields = @{ project = @{ key = $ForeignKey } } }) 'never'
  Case 'create, parent via additional_fields' (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Task'; additional_fields = @{ parent = @{ key = $F1 } } }) 'never'
  Case 'create, assignToSprint' (A createJiraIssue @{ projectKey = $Key; summary = 'x'; issueType = 'Task'; assignToSprint = 'active' }) 'never'
  Case 'create, missing projectKey' (A createJiraIssue @{ summary = 'x'; issueType = 'Task' }) 'never'
  Case 'create, lowercase key' (A createJiraIssue @{ projectKey = $Key.ToLower(); summary = 'x'; issueType = 'Task' }) 'never'
  Case 'create, foreign cloudId' (A createJiraIssue @{ cloudId = '00000000-0000-0000-0000-000000000000'; projectKey = $Key; summary = 'x'; issueType = 'Task' }) 'never'
  Case 'create with no input' (P 'mcp__atlassian__createJiraIssue' @{ cloudId = $null }) 'never'
  Case "edit, $ForeignKey parent" (A editJiraIssue @{ issueIdOrKey = $K1; fields = @{ parent = @{ key = $F1 } } }) 'never'
  Case "edit, $ForeignKey parent (addl)" (A editJiraIssue @{ issueIdOrKey = $K1; additional_fields = @{ Parent = $F1 } }) 'never'
  Case "edit, $ForeignKey parent (update)" (A editJiraIssue @{ issueIdOrKey = $K1; update = @{ parent = @(@{ set = @{ key = $F1 } }) } }) 'never'
  Case "edit, rank vs $ForeignKey" (A editJiraIssue @{ issueIdOrKey = $K1; rankAfterIssue = $F1 }) 'never'
  Case 'edit, move project' (A editJiraIssue @{ issueIdOrKey = $K1; fields = @{ project = @{ key = $ForeignKey } } }) 'never'
  Case 'edit, issue links' (A editJiraIssue @{ issueIdOrKey = $K1; fields = @{ issuelinks = @() } }) 'never'
  Case 'edit with no key' (A editJiraIssue) 'never'
  Case "transition, $ForeignKey parent" (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31'; fields = @{ parent = @{ key = $F1 } } }) 'never'

  # --- ways around the prefix check ---------------------------------------
  Case 'bare numeric issue id' (A getJiraIssue @{ issueIdOrKey = '10042' }) 'never'
  Case 'missing issue key' (A getJiraIssue) 'never'
  Case 'issue given as foreign URL' (A getJiraIssue @{ issueIdOrKey = "https://$Site/browse/$F1" }) 'never'

  # --- JQL bypasses --------------------------------------------------------
  Case 'unpinned JQL' (A searchJiraIssuesUsingJql @{ jql = 'assignee = currentUser()' }) 'never'
  Case 'negated project JQL' (A searchJiraIssuesUsingJql @{ jql = "project != $Key" }) 'never'
  Case 'JQL project in (two keys)' (A searchJiraIssuesUsingJql @{ jql = "project in ($Key, $ForeignKey)" }) 'never'
  Case 'JQL pinned OR other project' (A searchJiraIssuesUsingJql @{ jql = "project = $Key OR project = $ForeignKey" }) 'never'
  Case 'JQL pinned OR key' (A searchJiraIssuesUsingJql @{ jql = "project = $Key OR key = $F1" }) 'never'
  Case 'JQL AND then OR' (A searchJiraIssuesUsingJql @{ jql = "project = $Key AND status = Done OR assignee = currentUser()" }) 'never'
  Case 'JQL || operator' (A searchJiraIssuesUsingJql @{ jql = "project = $Key || project = $ForeignKey" }) 'never'
  Case 'JQL pin not leading' (A searchJiraIssuesUsingJql @{ jql = "key = $F1 AND project = $Key" }) 'never'
  Case 'JQL clause OR before project' (A searchJiraIssuesUsingJql @{ jql = "assignee = currentUser() OR project = $Key" }) 'never'
  Case 'JQL key prefix (KEYX)' (A searchJiraIssuesUsingJql @{ jql = "project = ${Key}X" }) 'never'
  Case 'JQL second project clause' (A searchJiraIssuesUsingJql @{ jql = "project = $Key AND project = $ForeignKey" }) 'never'

  # --- site pinning --------------------------------------------------------
  Case 'own cloudId' (A getJiraIssue @{ issueIdOrKey = $K1 }) 'read'
  Case 'site URL as cloudId' (A getJiraIssue @{ cloudId = "https://$Site"; issueIdOrKey = $K1 }) 'read'
  Case 'foreign cloudId (issue)' (A getJiraIssue @{ cloudId = '00000000-0000-0000-0000-000000000000'; issueIdOrKey = $K1 }) 'never'
  Case 'foreign site URL (JQL)' (A searchJiraIssuesUsingJql @{ cloudId = 'https://other.atlassian.net'; jql = "project = $Key" }) 'never'
  Case 'foreign site prefix' (A getJiraIssue @{ cloudId = 'other'; issueIdOrKey = $K1 }) 'never'
  Case 'look-alike site URL' (A getJiraIssue @{ cloudId = "https://$Site.evil.com"; issueIdOrKey = $K1 }) 'never'
  Case 'missing cloudId' (A getJiraIssue @{ cloudId = $null; issueIdOrKey = $K1 }) 'never'

  # --- scope creep on transitions -----------------------------------------
  Case 'transition carrying fields' (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31'; fields = @{ summary = 'hijacked' } }) 'full'
  Case 'transition carrying update' (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31'; update = @{ summary = @(@{ set = 'x' }) } }) 'full'
  Case 'transition into a sprint' (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31'; sprintId = 5 }) 'never'
  Case 'transition to backlog' (A transitionJiraIssue @{ issueIdOrKey = $K1; assignToBacklog = $true }) 'never'
  Case 'transition historyMetadata' (A transitionJiraIssue @{ issueIdOrKey = $K1; transitionId = '31'; historyMetadata = @{ type = 'x' } }) 'never'
  Case 'transition with no target' (A transitionJiraIssue @{ issueIdOrKey = $K1 }) 'never'

  # --- tools that are never allowed ---------------------------------------
  Case 'list transitions (execute-only on v2)' (A listJiraIssueTransitions @{ issueIdOrKey = $K1 }) 'never'
  Case 'list comments (execute-only on v2)' (A listJiraIssueComments @{ issueIdOrKey = $K1 }) 'never'
  Case 'list all projects' (A getVisibleJiraProjects) 'never'
  Case 'issue link' (A createIssueLink @{ inwardIssue = $K1; outwardIssue = $F1 }) 'never'
  Case 'worklog' (A addWorklogToJiraIssue @{ issueIdOrKey = $K1 }) 'never'
  Case 'discover' (A discover @{ goal = 'read any issue' }) 'never'
  Case 'executeRead at foreign issue' (A executeRead @{ name = 'getJiraIssue'; inputs = @{ issueIdOrKey = $F1 } }) 'never'
  Case 'executeRead at own issue' (A executeRead @{ name = 'getJiraIssue'; inputs = @{ issueIdOrKey = $K1 } }) 'never'
  Case 'executeWrite' (A executeWrite @{ name = 'editJiraIssue' }) 'never'
  Case 'executeDestructive' (A executeDestructive @{ name = 'deleteJiraIssue' }) 'never'
  Case 'generic fetch' (A fetch @{ url = "https://$Site/browse/$F1" }) 'never'
  Case 'site-wide search' (A search @{ query = 'x' }) 'never'
  Case 'confluence search' (A searchConfluence @{ query = 'x' }) 'never'
  Case 'confluence write' (A updateConfluenceContent) 'never'
  Case 'teamwork graph' (A getGraphContext) 'never'
  Case 'loom' (A getLoomVideo) 'never'

  # --- unknown tool: deny-by-default must catch it -------------------------
  Case 'invented future tool' (A someToolAddedNextYear) 'never'

  # --- fail closed ---------------------------------------------------------
  Case 'malformed payload' 'not json at all' 'never'
)

$fail = 0
foreach ($c in $cases) {
  $decision = ($c.Json | node $Hook | ConvertFrom-Json).hookSpecificOutput.permissionDecision
  if (-not $decision) { $decision = 'NONE' }
  $decision = $decision.ToUpper()
  if ($decision -eq $c.Expect) {
    "{0,-40} expect {1,-5} got {2,-5} ok" -f $c.Name, $c.Expect, $decision
  } else {
    $fail++
    "{0,-40} expect {1,-5} got {2,-5} FAIL" -f $c.Name, $c.Expect, $decision
  }
}

""
if ($fail) {
  "$fail of $($cases.Count) FAILED (access: $Access)"
  exit 1
}
"all $($cases.Count) cases pass (access: $Access)"

# The override is deliberately not covered here: it depends on file mtime, and a test
# that creates .claude/jira-unlock would leave a live unlock behind if it crashed
# midway. Check it by hand when changing that code path.
