#!/usr/bin/env node
// Composite of C:\sites\resume-tweaks\.claude\hooks\jira-project-guard.cjs (strict JQL, site pinning),
// C:\sites\hydrodent\.claude\hooks\jira-project-guard.cjs (argument allow-lists) and
// C:\sites\grishdavtian\.claude\hooks\jira-project-guard.cjs (full-write field checks).
/**
 * PreToolUse guard: this repo may only ever touch ONE Jira project.
 *
 * Atlassian's MCP OAuth grant covers the whole site -- every project, across many
 * Atlassian products -- so the connection is not a project boundary. This hook is.
 * It is deny-by-default: any mcp__atlassian__* tool not explicitly allowed below is
 * refused, even if it looks harmless.
 *
 * ACCESS (set once at install time):
 *   'read'    read <KEY>-* issues and JQL pinned to <KEY>
 *   'comment' + comment on and transition (status only) <KEY>-* issues   [default]
 *   'create'  + create new <KEY> issues (plain fields only)
 *   'full'    + edit <KEY>-* issues; transitions may carry fields. Nothing may point
 *             an issue at another project (parent, rank anchor, project, issue links).
 * No level allows deletes or the generic execute* runners.
 *
 * Override: create .claude/jira-unlock containing a line "<KEY> <minutes>", e.g.
 * "ABC 30". Only a human should ever create that file, by hand, from the terminal.
 * It expires and is gitignored. See CLAUDE.md.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_KEY = 'HD';
const ACCESS = 'comment'; // read | comment | create | full
// The one Atlassian site this repo talks to. Tools accept cloudId as a UUID, a site
// prefix, or any Jira URL, so pin it rather than trust whatever is passed.
const CLOUD_ID = '4bf735dc-4f63-4fd4-8adf-038fe793af25';
const SITE_HOST = 'harmadavtian.atlassian.net'; // e.g. yoursite.atlassian.net
const UNLOCK_FILE = path.join(__dirname, '..', 'jira-unlock');

const LEVELS = ['read', 'comment', 'create', 'full'];
const level = LEVELS.indexOf(ACCESS);
const atLeast = (name) => level >= LEVELS.indexOf(name);

// --- read the hook payload from stdin -------------------------------------
let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch {
  raw = '';
}

let payload = {};
try {
  payload = JSON.parse(raw || '{}');
} catch {
  // A malformed payload must not become an accidental allow.
  deny('Could not parse the hook payload, so the Jira project guard cannot verify this call.');
}

const toolName = payload.tool_name || '';
const input = payload.tool_input || {};

// Not an Atlassian call: none of our business.
if (!toolName.startsWith('mcp__atlassian__')) {
  allow();
}

// A template that was never filled in must fail closed, not open.
if (level < 0 || /^__.*__$/.test(PROJECT_KEY) || /^__.*__$/.test(CLOUD_ID) || /^__.*__$/.test(SITE_HOST)) {
  deny('The Jira project guard is not configured (placeholders still in the hook).');
}

const shortName = toolName.slice('mcp__atlassian__'.length);

// --- override ------------------------------------------------------------
// A human-created, self-expiring file may widen the guard to one extra project.
function unlockedKeys() {
  let text;
  try {
    text = fs.readFileSync(UNLOCK_FILE, 'utf8');
  } catch {
    return [];
  }
  const stat = fs.statSync(UNLOCK_FILE);
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z][A-Z0-9]+)\s+(\d+)$/);
    if (!m) continue;
    const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
    if (ageMinutes <= Number(m[2])) keys.push(m[1]);
  }
  return keys;
}

const extraKeys = unlockedKeys();
const allowedKeys = [PROJECT_KEY, ...extraKeys];
const issueRe = new RegExp(`^(${allowedKeys.join('|')})-\\d+$`);

function keyNote() {
  return extraKeys.length
    ? ` Currently unlocked in addition to ${PROJECT_KEY}: ${extraKeys.join(', ')}.`
    : '';
}

const SCOPE_TEXT = {
  read: `read ${PROJECT_KEY}-* issues`,
  comment: `read, comment on, and transition ${PROJECT_KEY}-* issues`,
  create: `read, comment on, transition and create ${PROJECT_KEY}-* issues`,
  full: `read, comment on, transition, create and edit ${PROJECT_KEY}-* issues`,
}[ACCESS];

// --- tool policy ---------------------------------------------------------
// NOTE: these names follow Atlassian's v2 (streamable HTTP) tool surface. Tool names
// change between server versions -- verify against the live tool list when installing,
// and again whenever the server is upgraded. listJiraIssueTransitions,
// listJiraIssueComments, addWorklogToJiraIssue and createIssueLink exist on v2 only
// behind the execute* runners, so they are deliberately absent.

// Carry no project-scoped data at all; safe unconditionally.
const NEUTRAL = new Set([
  // The OAuth handshake itself. It carries no project data, and without it the
  // server can never connect -- the guard blocks its own front door otherwise.
  'authenticate',
  'complete_authentication',
  'atlassianUserInfo',
  'getAccessibleAtlassianResources',
  'getContentFormatGuide',
  'lookupJiraAccountId',
]);

// Act on a single existing issue; the issue key must be in an allowed project.
const ISSUE_SCOPED = new Set(['getJiraIssue']);
if (atLeast('comment')) {
  ISSUE_SCOPED.add('addOrEditJiraIssueComment');
  ISSUE_SCOPED.add('transitionJiraIssue');
}
if (atLeast('full')) ISSUE_SCOPED.add('editJiraIssue');

if (NEUTRAL.has(shortName)) {
  allow();
}

// Everything past this point carries project data, so it must name this site.
// cloudId is required: every v2 Jira tool takes it, and a missing one is refused
// rather than left to the server's default.
function checkSite() {
  const c = input.cloudId;
  const s = String(c ?? '').trim().toLowerCase();
  const sitePrefix = SITE_HOST.split('.')[0].toLowerCase();
  const urlHost = (() => {
    try { return new URL(s).hostname; } catch { return null; }
  })();
  if (s && (s === CLOUD_ID.toLowerCase() || s === sitePrefix || s === SITE_HOST.toLowerCase() || urlHost === SITE_HOST.toLowerCase())) return;
  deny(`Blocked: cloudId "${c ?? ''}" is not this repo's Atlassian site. Use ${CLOUD_ID} (${SITE_HOST}).`);
}

// Anything that names another issue (parent, rank anchor) must stay inside the project.
function checkLinkedKey(label, value) {
  if (value === undefined || value === null || value === '') return;
  const key = typeof value === 'object' ? (value.key ?? value.id ?? '') : value;
  if (!issueRe.test(String(key).trim())) {
    deny(
      `Blocked: ${shortName} sets ${label} to "${typeof value === 'object' ? JSON.stringify(value) : value}", ` +
        `which is not a ${PROJECT_KEY} issue. Calls from this repo may only reference ` +
        `${PROJECT_KEY}-* issues. Use a full key like ${PROJECT_KEY}-1.${keyNote()}`
    );
  }
}

// Field bags (fields, additional_fields, update) may not move or link an issue out of
// the project. `update` holds operation lists ([{set: ...}]), so each op is checked.
function checkFieldPayloads() {
  for (const bagName of ['fields', 'additional_fields', 'update']) {
    const bag = input[bagName];
    if (!bag || typeof bag !== 'object') continue;
    for (const [name, value] of Object.entries(bag)) {
      const n = name.toLowerCase();
      if (n === 'issuelinks' || n === 'project') {
        deny(`Blocked: ${shortName} may not set "${name}"; it can move or link an issue outside ${PROJECT_KEY}.`);
      }
      if (n === 'parent') {
        if (Array.isArray(value)) {
          for (const op of value) {
            if (!op || typeof op !== 'object') { deny(`Blocked: malformed parent update on ${shortName}.`); }
            for (const v of Object.values(op)) checkLinkedKey('parent', v);
          }
        } else {
          checkLinkedKey('parent', value);
        }
      }
    }
  }
}

// Allow-list of arguments: anything the server adds later is refused until reviewed.
function checkArgs(allowed, what) {
  for (const [arg, v] of Object.entries(input)) {
    if (allowed.has(arg)) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object' && Object.keys(v).length === 0) continue;
    deny(
      `Blocked: ${shortName} was called with "${arg}", which is not on this repo's allow-list ` +
        `(${what}).`
    );
  }
}

if (ISSUE_SCOPED.has(shortName)) {
  checkSite();
  const key = String(input.issueIdOrKey ?? '').trim();
  if (!key) {
    deny(`${shortName} was called without an issue key.`);
  }
  if (!issueRe.test(key)) {
    // Bare numeric ids (e.g. "10042") are refused on purpose: they name an issue
    // without naming its project, so they are an easy way around the prefix check.
    deny(
      `Blocked: "${key}" is not an issue in the ${PROJECT_KEY} project. This repo is wired ` +
        `to ${PROJECT_KEY} only; every other project on the Jira site is off limits. ` +
        `Use a full key like ${PROJECT_KEY}-1, never a numeric issue id.${keyNote()}`
    );
  }

  if (shortName === 'transitionJiraIssue') {
    // Below 'full', a transition may move status and nothing else: `fields`/`update`
    // would let a "status change" rewrite issue content. At every level, sprintId /
    // boardId / assignToBacklog / historyMetadata are refused -- they move the ticket
    // between sprints and boards, which can belong to other projects.
    const args = new Set(['cloudId', 'issueIdOrKey', 'transitionId', 'transitionName', 'actionSource']);
    if (atLeast('full')) { args.add('fields'); args.add('update'); }
    checkArgs(args, 'a transition here moves status' + (atLeast('full') ? ' and sets fields' : ' only; put narrative in a comment'));
    if (!input.transitionId && !input.transitionName) {
      deny('Blocked: transitionJiraIssue needs a transitionId or transitionName.');
    }
    checkFieldPayloads();
  }

  if (shortName === 'editJiraIssue') {
    checkFieldPayloads();
    checkLinkedKey('rankBeforeIssue', input.rankBeforeIssue);
    checkLinkedKey('rankAfterIssue', input.rankAfterIssue);
  }

  allow();
}

// Creating an issue names a PROJECT, not an issue key, so it needs its own checks.
// Below 'full', `additional_fields` is refused outright (raw Jira fields could override
// the checked project or parent); at 'full' it is allowed but inspected. assignToSprint
// can name another project's sprint, so it is refused at every level.
if (shortName === 'createJiraIssue' && atLeast('create')) {
  checkSite();
  const args = new Set([
    'cloudId', 'projectKey', 'summary', 'issueType', 'description', 'contentFormat',
    'parent', 'labels', 'priority', 'assignee',
  ]);
  if (atLeast('full')) args.add('additional_fields');
  checkArgs(args, 'create issues with plain fields only');
  const projectKey = String(input.projectKey ?? '').trim();
  if (!allowedKeys.includes(projectKey)) {
    deny(
      `Blocked: createJiraIssue targets project "${projectKey}". This repo may only ` +
        `create issues in ${PROJECT_KEY}.${keyNote()}`
    );
  }
  checkLinkedKey('parent', input.parent);
  checkFieldPayloads();
  allow();
}

// JQL search: the query must pin itself to an allowed project.
if (shortName === 'searchJiraIssuesUsingJql') {
  checkSite();
  // "Contains a project clause" is not enough: `project in (KEY, OTHER)`,
  // `project = KEY OR project = OTHER` and `project = KEYX` all contain one. The query
  // must OPEN with a single-key project clause, joined to the rest by AND only, with no
  // OR anywhere and no second project clause -- so every other clause can only narrow.
  const jql = String(input.jql ?? '');
  const keys = allowedKeys.join('|');
  const leading = new RegExp(
    `^\\s*project\\s*=\\s*(["']?)(${keys})\\1\\s*(AND\\b|ORDER\\s+BY\\b|$)`,
    'i'
  );
  const usage =
    `Every search from this repo must begin with "project = ${PROJECT_KEY}", joined to ` +
    `the rest by AND only (use "x in (a, b)" for alternatives), e.g. ` +
    `project = ${PROJECT_KEY} AND statusCategory != Done ORDER BY created DESC.${keyNote()}`;
  if (!leading.test(jql)) {
    deny(`Blocked: this JQL is not pinned to a permitted project. ${usage}`);
  }
  if (/\bOR\b|\|\|/i.test(jql)) {
    deny(`Blocked: OR can widen a search past the allowed project, so it is refused. ${usage}`);
  }
  if ((jql.match(/\bproject\b/gi) || []).length > 1) {
    deny(`Blocked: only one project clause is allowed. ${usage}`);
  }
  allow();
}

// Everything else is refused, with a reason worth reading.
const WHY = {
  addOrEditJiraIssueComment: `commenting is not part of the agreed access (${ACCESS})`,
  transitionJiraIssue: `moving status is not part of the agreed access (${ACCESS})`,
  createJiraIssue: `creating tickets is not part of the agreed access (${ACCESS})`,
  editJiraIssue: `editing ticket fields is not part of the agreed access (${ACCESS})`,
  addWorklogToJiraIssue: 'logging work is not part of the agreed access',
  createIssueLink: 'linking issues can reach other projects',
  listJiraIssueTransitions: 'it is only reachable through the execute runner on v2',
  listJiraIssueComments: 'it is only reachable through the execute runner on v2; read comments via getJiraIssue',
  getVisibleJiraProjects: 'it lists every project on the site, not just this one',
  getJiraProjectIssueTypesMetadata: 'it is project-wide metadata and takes an arbitrary project key',
  search: 'it is an unscoped site-wide search that can return other projects',
  fetch: 'it takes an arbitrary Atlassian URL and so bypasses every project check',
  // The generic runners take an operation name plus free-form inputs, so no argument
  // check here could be trusted -- they are the widest bypass on offer.
  discover: 'it exists to find operations for the execute-family runners, which are blocked',
  executeRead: 'it runs an arbitrary named Atlassian operation, bypassing every project check',
  executeWrite: 'it runs an arbitrary named write operation, bypassing every project check',
  executeDestructive: 'it runs arbitrary destructive operations (deletes, irreversible changes)',
  addGraphContext: 'the teamwork graph spans the whole site, not just this project',
  getGraphContext: 'the teamwork graph spans the whole site, not just this project',
  getGraphObject: 'the teamwork graph spans the whole site, not just this project',
};

const why = WHY[shortName] || (
  shortName.toLowerCase().includes('confluence')
    ? 'Confluence is out of scope for this repo'
    : 'it is not on this repo\'s allow-list, and the guard denies by default'
);

deny(
  `Blocked: ${shortName} is not permitted from this repo because ${why}. ` +
    `Allowed here: ${SCOPE_TEXT}, and JQL searches pinned to project = ${PROJECT_KEY}.${keyNote()}`
);

// --- helpers -------------------------------------------------------------
function allow() {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Within this repo\'s Jira project scope.',
      },
    })
  );
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}
