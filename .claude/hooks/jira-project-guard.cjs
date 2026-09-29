#!/usr/bin/env node
/**
 * PreToolUse guard: this repo may only ever touch ONE Jira project.
 *
 * C:\sites\scrolling-resume is the "Harma Davtian Portfolio Site" project (key HD)
 * on harmadavtian.atlassian.net. That Jira site also hosts other projects, client
 * work among them. The agent working in this repo must not read, search, or write
 * anything outside HD. The projects are deliberately not listed: the guard denies
 * by default, so it blocks them without knowing they exist.
 *
 * The MCP connection itself cannot be scoped per project -- the OAuth grant covers
 * the whole site -- so this hook is the actual boundary. It is deny-by-default:
 * any mcp__atlassian__* tool not explicitly allowed below is refused, even if it
 * looks harmless.
 *
 * Override: create .claude/jira-unlock containing a line "<KEY> <minutes>", e.g.
 * "OTHERKEY 30". Only a human should create that file, by hand, from the terminal.
 * It expires and is gitignored. See CLAUDE.md.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_KEY = 'HD';
const ISSUE_RE = /^HD-\d+$/;
const UNLOCK_FILE = path.join(__dirname, '..', 'jira-unlock');

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

// --- tool policy ---------------------------------------------------------
// Read + comment + transition on HD only. No create, no field edits, no deletes.

// Carry no project-scoped data at all; safe unconditionally.
const NEUTRAL = new Set([
  // The OAuth handshake itself. It carries no project data, and without it the
  // server can never connect -- the guard blocked its own front door once already.
  'authenticate',
  'complete_authentication',
  'atlassianUserInfo',
  'getAccessibleAtlassianResources',
  'getContentFormatGuide',
  'getIssueLinkTypes',
  'lookupJiraAccountId',
]);

// Act on a single issue; the issue key must be in an allowed project.
// Names follow the v2 (streamable HTTP) tool surface, which renamed several v1 tools.
const ISSUE_SCOPED = new Set([
  'getJiraIssue',
  'listJiraIssueTransitions',
  'listJiraIssueComments',
  'addOrEditJiraIssueComment',
  'transitionJiraIssue',
]);

if (NEUTRAL.has(shortName)) {
  allow();
}

if (ISSUE_SCOPED.has(shortName)) {
  const key = String(input.issueIdOrKey ?? '').trim();
  if (!key) {
    deny(`${shortName} was called without an issue key.`);
  }
  if (!issueRe.test(key)) {
    // Bare numeric ids (e.g. "10042") are refused on purpose: they name an issue
    // without naming its project, so they are an easy way around the prefix check.
    deny(
      `Blocked: "${key}" is not an issue in the ${PROJECT_KEY} project. This repo ` +
        `(scrolling-resume) is wired to ${PROJECT_KEY} only; every other project on the ` +
        `Jira site is off limits. Use a full key like ${PROJECT_KEY}-1, never a numeric ` +
        `issue id.${keyNote()}`
    );
  }
  // A transition may move status and nothing else. v2's transitionJiraIssue also
  // accepts `fields` and `update`, which would let a "status change" rewrite
  // arbitrary issue content -- past the read/comment/transition scope agreed here.
  if (shortName === 'transitionJiraIssue') {
    for (const arg of ['fields', 'update']) {
      const v = input[arg];
      if (v && typeof v === 'object' && Object.keys(v).length > 0) {
        deny(
          `Blocked: transitionJiraIssue was called with "${arg}", which edits issue fields ` +
            `during the transition. This repo may move a ticket's status but not change its ` +
            `content. Move the status alone, and put any narrative in a comment.`
        );
      }
    }
  }

  allow();
}

// JQL search: the query must pin itself to an allowed project.
if (shortName === 'searchJiraIssuesUsingJql') {
  const jql = String(input.jql ?? '');
  const pinned = allowedKeys.some((k) =>
    new RegExp(`project\\s*(=|in)\\s*\\(?\\s*"?'?${k}"?'?`, 'i').test(jql)
  );
  if (!pinned) {
    deny(
      `Blocked: this JQL is not pinned to a permitted project. Every search from this ` +
        `repo must include a "project = ${PROJECT_KEY}" clause, e.g. ` +
        `project = ${PROJECT_KEY} AND statusCategory != Done ORDER BY created DESC.${keyNote()}`
    );
  }
  if (/\bproject\s*(!=|not\s+in)/i.test(jql)) {
    deny('Blocked: negated project clauses can widen a search past the allowed project.');
  }
  allow();
}

// Everything else is refused, with a reason worth reading.
const WHY = {
  createJiraIssue: 'creating tickets is not part of the agreed access (read + comment + transition)',
  editJiraIssue: 'editing ticket fields is not part of the agreed access',
  addWorklogToJiraIssue: 'logging work is not part of the agreed access',
  createIssueLink: 'linking issues is not part of the agreed access',
  getVisibleJiraProjects: 'it lists every project on the site, not just this one',
  getJiraProjectIssueTypesMetadata: 'it is project-wide metadata and takes an arbitrary project key',
  search: 'it is an unscoped site-wide search that can return other projects',
  fetch: 'it takes an arbitrary Atlassian URL and so bypasses every project check',
  // v2's generic runners take an operation name plus free-form inputs, so no
  // argument check here could be trusted -- they are the widest bypass on offer.
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
    ? 'Confluence is out of scope for this repo (and the OAuth grant is Jira-only)'
    : 'it is not on this repo\'s allow-list, and the guard denies by default'
);

deny(
  `Blocked: ${shortName} is not permitted from scrolling-resume because ${why}. ` +
    `Allowed here: read, comment on, and transition ${PROJECT_KEY}-* issues, and JQL ` +
    `searches pinned to project = ${PROJECT_KEY}.${keyNote()}`
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
