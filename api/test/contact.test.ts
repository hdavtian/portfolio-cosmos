import { solveChallenge as altchaSolve } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SESSION_COOKIE_NAME } from "../src/auth/requireAuth.js";
import { createSessionToken } from "../src/auth/sessionToken.js";
import { createContactChallenge } from "../src/v2/contact/altcha.js";
import { __testing } from "../src/v2/contact/contactMail.js";
import { fingerprintOf, generateReference } from "../src/v2/contact/contactStore.js";
import { __resetRateLimits } from "../src/v2/contact/publicContactRouter.js";
import { headerSafe } from "../src/v2/contact/mailer.js";
import { getDb } from "../src/v2/db.js";
import { ensureIndexes } from "../src/v2/indexes.js";
import { mongoAvailable, resetDb, SKIP_MESSAGE, stopMongo } from "./helpers/mongo.js";

/**
 * The contact form. HD-4.
 *
 * Two halves. The first needs no database and covers the things that are wrong
 * in ways nobody notices: the escaping on the way into an email, the header
 * stripping, and the fingerprint that decides what counts as the same message.
 * The second drives the real endpoints.
 *
 * Deliberately *not* tested here: that an email actually arrives. Nothing in
 * the suite has a credential, and `mailer.configured` is false, so every send
 * short-circuits and the row records that nothing went out. That is checked —
 * but a delivered message can only be confirmed by sending one.
 */

const app = createApp();

const dockerMongo = await mongoAvailable();

// Matches vitest.config.ts.
const COOKIE_SECRET = "test-cookie-secret-test-cookie-secret";

/** Comfortably above MAX_COUNTER in altcha.ts, so a solve never gives up early. */
const MAX_SOLVER_COUNTER = 20_000;

const authCookie = (): string =>
  `${SESSION_COOKIE_NAME}=${createSessionToken({
    secret: COOKIE_SECRET,
    subject: "owner",
    ttlSeconds: 3600,
  })}`;

/**
 * A solved challenge, in the base64 shape the widget posts.
 *
 * Solved with the library's own solver rather than a reimplementation of
 * PBKDF2. A hand-rolled copy of the derivation was tried first and only proved
 * that the test could reproduce a hash, which is not what any of this is for —
 * and it went wrong on the v2 challenge shape (`parameters`, not a flat salt).
 * Using the real solver means the test exercises the same path a browser does.
 *
 * It costs about a second of CPU per call, which is the point of the feature,
 * so the timeouts below are set accordingly.
 */
const solveChallenge = async (): Promise<string> => {
  const challenge = await createContactChallenge();

  const solution = await altchaSolve({
    challenge,
    deriveKey,
    max: MAX_SOLVER_COUNTER,
  });

  if (!solution) throw new Error("Could not solve the test challenge");

  return Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");
};

describe("contact form, without a database", () => {
  describe("escaping into an email", () => {
    it("turns a script tag into visible characters", () => {
      const html = __testing.paragraphs('<script>alert("x")</script>');
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&quot;x&quot;");
    });

    it("escapes before formatting, so our own tags survive", () => {
      // Two blank-line-separated blocks become two paragraphs, and the single
      // newline inside the first becomes a <br /> -- both ours, unescaped.
      const html = __testing.paragraphs("one\ntwo\n\nthree");
      expect(html).toContain("<br />");
      expect(html).toContain("<p style=");
      expect(html).not.toContain("&lt;br");
    });

    it("escapes a quote that would break out of an attribute", () => {
      expect(__testing.escapeHtml(`" onerror="alert(1)`)).toBe(
        "&quot; onerror=&quot;alert(1)",
      );
    });

    it("escapes the name and message in a notification", () => {
      const message = __testing.notification(
        {
          reference: "ABCD2345",
          name: '<img src=x onerror="alert(1)">',
          email: "visitor@example.com",
          message: "<b>bold</b> & <i>italic</i>",
          submittedAt: new Date("2026-09-30T12:00:00Z"),
        },
        {
          notifyEmail: "harmadavtian@gmail.com",
          confirmationEnabled: true,
          confirmationSubject: "Thanks",
          confirmationBody: "Body",
        },
      );

      expect(message.html).not.toContain("<img");
      expect(message.html).not.toContain("<b>bold</b>");
      expect(message.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
      expect(message.html).toContain("&amp;");
      // The visitor's address is Reply-To, never From. See mailer.ts.
      expect(message.replyTo).toBe("visitor@example.com");
    });

    it("escapes an operator-written confirmation body too", () => {
      const message = __testing.confirmation(
        {
          reference: "ABCD2345",
          name: "Visitor",
          email: "visitor@example.com",
          message: "A genuine note about a project.",
          submittedAt: new Date("2026-09-30T12:00:00Z"),
        },
        {
          notifyEmail: "harmadavtian@gmail.com",
          confirmationEnabled: true,
          confirmationSubject: "Thanks",
          // Typed in the admin. Stored as plain text, so it must not become a tag.
          confirmationBody: "Thanks! <b>Really</b>.",
        },
      );

      expect(message.html).not.toContain("<b>Really</b>");
      expect(message.html).toContain("&lt;b&gt;Really&lt;/b&gt;");
    });
  });

  describe("email headers", () => {
    it("strips the newline that would inject a header", () => {
      expect(headerSafe("Visitor\r\nBcc: victim@example.com")).toBe(
        "Visitor Bcc: victim@example.com",
      );
      expect(headerSafe("Visitor\nBcc: x")).not.toContain("\n");
    });
  });

  describe("fingerprints", () => {
    it("treats a retyped message with different whitespace as the same one", () => {
      expect(fingerprintOf("a@b.com", "Hello  there\n\nworld")).toBe(
        fingerprintOf("a@b.com", "hello there world"),
      );
    });

    it("treats the same note from another address as different", () => {
      expect(fingerprintOf("a@b.com", "Hello there")).not.toBe(
        fingerprintOf("c@d.com", "Hello there"),
      );
    });
  });

  describe("references", () => {
    it("uses only characters that survive being read aloud", () => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        expect(generateReference()).toMatch(/^[23456789BCDFGHJKLMNPQRSTVWXYZ]{8}$/);
      }
    });
  });
});

/*
 * A generous timeout, scoped to this block rather than raised globally.
 *
 * Every accepted submission here solves a real proof-of-work challenge, which
 * costs about a second of CPU by design -- that is the feature, not slow tests
 * -- and a few of them solve two. The default five seconds is not enough, and
 * lengthening it for the whole suite would slow down every genuine hang
 * elsewhere.
 */
describe.skipIf(!dockerMongo)(
  `contact form endpoints (${dockerMongo ? "docker" : SKIP_MESSAGE})`,
  { timeout: 60_000 },
  () => {
  beforeAll(async () => {
    await ensureIndexes(getDb());
  }, 60_000);

  afterAll(async () => {
    await stopMongo();
  });

  beforeEach(async () => {
    await resetDb();
    await ensureIndexes(getDb());
    /* The rate limiter is process-wide module state, so one test's budget
       would otherwise be spent by the ones before it. */
    __resetRateLimits();
  });

  /**
   * A body that should be accepted, with the challenge already solved.
   *
   * `renderedAt` is stamped *after* the solve, and `ageMs` shifts it, because
   * solving takes a second or two of real CPU. Passing `renderedAt: Date.now()`
   * as an override read the clock before that wait, so a body meant to look
   * impossibly fast arrived several seconds old and sailed past the timing
   * check -- the test failed for the opposite of the reason it was testing.
   */
  const validBody = async (
    overrides: Record<string, unknown> = {},
    ageMs = 10_000,
  ) => {
    const altcha = await solveChallenge();
    return {
      name: "A Visitor",
      email: "visitor@example.com",
      message: "I saw the portfolio and wanted to ask about the cosmos scene.",
      altcha,
      renderedAt: Date.now() - ageMs,
      ...overrides,
    };
  };

  it("stores a message and returns its reference", async () => {
    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody());

    expect(response.status).toBe(201);
    expect(response.body.reference).toMatch(/^[23456789BCDFGHJKLMNPQRSTVWXYZ]{8}$/);

    const stored = await getDb().collection("contactSubmissions").findOne({});
    expect(stored?.status).toBe("new");
    expect(stored?.notes).toBe("");
    expect(stored?.version).toBe(1);
    /* Nobody was emailed, and the row says so.
       Asserted as "a reason is recorded" rather than one exact sentence: the
       suite reaches this either because no credential is set or because the
       test environment refuses to send even when one is (see mailer.ts). The
       point is that a message nobody was told about never looks delivered. */
    expect(typeof stored?.mailError).toBe("string");
    expect(stored?.mailError).not.toBe("");
  });

  it("stores the message exactly as it was typed, tags and all", async () => {
    const message = 'Look at this: <script>alert("hi")</script> — does it work?';
    await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ message }));

    const stored = await getDb().collection("contactSubmissions").findOne({});
    // Stored verbatim on purpose: the defence is escaping at every output, not
    // mangling what somebody wrote. See the note in contactMail.ts.
    expect(stored?.message).toBe(message);
  });

  it("refuses a submission with no solved challenge", async () => {
    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ altcha: undefined }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CHALLENGE_FAILED");
    expect(await getDb().collection("contactSubmissions").countDocuments()).toBe(0);
  });

  it("refuses a forged challenge payload without falling over", async () => {
    /* A plausible-looking blob: valid base64, valid JSON, a signature and a
       solution -- and nothing else the verifier needs. It used to reach
       `verifySolution`, throw, and surface as a 500 "Unexpected error", which
       is both the wrong answer and noise in the logs that looks like a real
       fault. Trivial to post, so it is asserted. */
    const forged = Buffer.from(
      JSON.stringify({ challenge: { signature: "fake" }, solution: { counter: 1 } }),
    ).toString("base64");

    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ altcha: forged }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CHALLENGE_FAILED");
    expect(await getDb().collection("contactSubmissions").countDocuments()).toBe(0);
  });

  it("refuses a replayed challenge", async () => {
    const altcha = await solveChallenge();

    const first = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ altcha }));
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ altcha, email: "other@example.com" }));

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("CHALLENGE_FAILED");
  });

  it("answers a honeypot exactly as it answers a success, and stores nothing", async () => {
    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ website: "http://spam.example" }));

    // 202 with no reference: a bot told why it failed can be adjusted until it
    // passes, so this must not look like a rejection.
    expect(response.status).toBe(202);
    expect(response.body.reference).toBeNull();
    expect(await getDb().collection("contactSubmissions").countDocuments()).toBe(0);
  });

  it("silently drops a submission that arrived impossibly fast", async () => {
    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({}, 0));

    expect(response.status).toBe(202);
    expect(await getDb().collection("contactSubmissions").countDocuments()).toBe(0);
  });

  it("silently drops a message stuffed with links", async () => {
    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(
        await validBody({
          message:
            "https://a.example https://b.example https://c.example https://d.example buy now",
        }),
      );

    expect(response.status).toBe(202);
    expect(await getDb().collection("contactSubmissions").countDocuments()).toBe(0);
  });

  it("returns the original reference for the same message sent twice", async () => {
    const first = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody());
    expect(first.status).toBe(201);

    // A double-click: same note, a fresh challenge, whitespace not identical.
    const second = await request(app)
      .post("/api/v2/contact/submissions")
      .send(
        await validBody({
          message: "  I saw the portfolio and wanted to ask about the   cosmos scene.  ",
        }),
      );

    expect(second.status).toBe(200);
    expect(second.body.reference).toBe(first.body.reference);
    expect(await getDb().collection("contactSubmissions").countDocuments()).toBe(1);
  });

  it("rejects a message under the minimum length", async () => {
    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ message: "hi" }));

    expect(response.status).toBe(400);
    expect(response.body.error.details.some((d: { path: string }) => d.path === "message")).toBe(
      true,
    );
  });

  it("rejects a message over the maximum length", async () => {
    const response = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ message: "x".repeat(4_001) }));

    expect(response.status).toBe(400);
  });

  it("rate-limits a third message from one address", async () => {
    // Two get through (MAX_PER_EMAIL_PER_HOUR), each a distinct message so the
    // duplicate guard is not what stops the third.
    for (const suffix of ["one", "two"]) {
      const response = await request(app)
        .post("/api/v2/contact/submissions")
        .send(await validBody({ message: `A genuine question about the site, number ${suffix}.` }));
      expect(response.status).toBe(201);
    }

    const third = await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody({ message: "A third genuine question about the site entirely." }));

    expect(third.status).toBe(429);
  });

  it("serves a challenge that is never cached", async () => {
    const response = await request(app).get("/api/v2/contact/challenge");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    /* The v2 challenge shape: signed parameters, not a flat salt+hash. */
    expect(response.body.signature).toBeTruthy();
    expect(response.body.parameters.salt).toBeTruthy();
  });

  it("exposes no settings publicly, so the notify address cannot leak", async () => {
    // There was a public settings endpoint serving one field; the field is
    // gone and so is the endpoint. Asserted rather than assumed, because a
    // route that quietly comes back serving the whole settings row would
    // publish the address the form exists to keep off the page.
    const response = await request(app).get("/api/v2/contact/settings");
    expect(response.status).toBe(404);
  });

  it("never sends mail from the test environment, even with a credential set", async () => {
    /* The regression this exists for: `env.ts` loads api/.env, so a developer
       with a real Gmail app password would otherwise have every form-
       submitting test in this file send a genuine email. */
    const { mailer } = await import("../src/v2/contact/mailer.js");
    expect(mailer.configured).toBe(false);
    expect(await mailer.send({ to: "nobody@example.com", subject: "x", html: "x", text: "x" })).toContain(
      "test environment",
    );
  });

  describe("the admin side", () => {
    const submit = async () => {
      const response = await request(app)
        .post("/api/v2/contact/submissions")
        .send(await validBody());
      return response.body.reference as string;
    };

    it("requires a session", async () => {
      await submit();
      const response = await request(app).get("/api/v2/admin/contactSubmissions");
      expect(response.status).toBe(401);
    });

    it("lists messages newest first, with status counts", async () => {
      await submit();

      const response = await request(app)
        .get("/api/v2/admin/contactSubmissions")
        .set("Cookie", authCookie());

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.counts).toEqual({ new: 1 });
      expect(response.body.items[0].email).toBe("visitor@example.com");
    });

    it("changes status and notes, bumping the version", async () => {
      await submit();
      const list = await request(app)
        .get("/api/v2/admin/contactSubmissions")
        .set("Cookie", authCookie());
      const record = list.body.items[0];

      const response = await request(app)
        .patch(`/api/v2/admin/contactSubmissions/${record.id}`)
        .set("Cookie", authCookie())
        .send({ status: "open", notes: "Replied by hand.", version: record.version });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("open");
      expect(response.body.notes).toBe("Replied by hand.");
      expect(response.body.version).toBe(record.version + 1);
      expect(response.body.updatedBy).toBe("owner");
    });

    it("cannot rewrite what the visitor wrote", async () => {
      await submit();
      const list = await request(app)
        .get("/api/v2/admin/contactSubmissions")
        .set("Cookie", authCookie());
      const record = list.body.items[0];

      await request(app)
        .patch(`/api/v2/admin/contactSubmissions/${record.id}`)
        .set("Cookie", authCookie())
        .send({ status: "open", message: "something else entirely", version: record.version });

      const after = await getDb().collection("contactSubmissions").findOne({});
      // The stored text is the record of what was said; the patch schema drops
      // anything but status and notes rather than letting it through.
      expect(after?.message).toBe(
        "I saw the portfolio and wanted to ask about the cosmos scene.",
      );
    });

    it("refuses a stale version with a conflict", async () => {
      await submit();
      const list = await request(app)
        .get("/api/v2/admin/contactSubmissions")
        .set("Cookie", authCookie());
      const record = list.body.items[0];

      await request(app)
        .patch(`/api/v2/admin/contactSubmissions/${record.id}`)
        .set("Cookie", authCookie())
        .send({ status: "open", version: record.version });

      const second = await request(app)
        .patch(`/api/v2/admin/contactSubmissions/${record.id}`)
        .set("Cookie", authCookie())
        .send({ status: "closed", version: record.version });

      expect(second.status).toBe(409);
    });

    it("filters by status", async () => {
      await submit();
      const list = await request(app)
        .get("/api/v2/admin/contactSubmissions")
        .set("Cookie", authCookie());
      const record = list.body.items[0];

      await request(app)
        .patch(`/api/v2/admin/contactSubmissions/${record.id}`)
        .set("Cookie", authCookie())
        .send({ status: "spam", version: record.version });

      const spam = await request(app)
        .get("/api/v2/admin/contactSubmissions?status=spam")
        .set("Cookie", authCookie());
      expect(spam.body.total).toBe(1);

      const fresh = await request(app)
        .get("/api/v2/admin/contactSubmissions?status=new")
        .set("Cookie", authCookie());
      expect(fresh.body.total).toBe(0);
    });

    it("deletes a message", async () => {
      await submit();
      const list = await request(app)
        .get("/api/v2/admin/contactSubmissions")
        .set("Cookie", authCookie());

      const response = await request(app)
        .delete(`/api/v2/admin/contactSubmissions/${list.body.items[0].id}`)
        .set("Cookie", authCookie());

      expect(response.status).toBe(204);
      expect(await getDb().collection("contactSubmissions").countDocuments()).toBe(0);
    });

    it("offers no way to create a message", async () => {
      const response = await request(app)
        .post("/api/v2/admin/contactSubmissions")
        .set("Cookie", authCookie())
        .send({ name: "Invented", email: "a@b.com", message: "Made up by the admin." });

      // R, U and D but no C: a message exists because somebody sent one.
      expect(response.status).toBe(404);
    });

    it("serves the defaults before the settings have ever been saved", async () => {
      const response = await request(app)
        .get("/api/v2/admin/contactSubmissions/settings")
        .set("Cookie", authCookie());

      expect(response.status).toBe(200);
      expect(response.body.version).toBe(0);
      expect(response.body.notifyEmail).toBe("harmadavtian@gmail.com");
      /* False in the suite whether or not a credential is present: the test
         environment cannot send. Guards the admin's "not configured" banner
         and, more importantly, guards the suite against emailing anybody. */
      expect(response.body.mailConfigured).toBe(false);
    });

    it("saves the settings and takes effect with no publish step", async () => {
      const first = await request(app)
        .get("/api/v2/admin/contactSubmissions/settings")
        .set("Cookie", authCookie());

      const saved = await request(app)
        .put("/api/v2/admin/contactSubmissions/settings")
        .set("Cookie", authCookie())
        .send({ ...first.body, confirmationSubject: "Got it, thanks", version: first.body.version });

      expect(saved.status).toBe(200);
      expect(saved.body.version).toBe(1);

      /* Readable again straight away, with no publish in between: these are
         not content and never enter a release. */
      const reread = await request(app)
        .get("/api/v2/admin/contactSubmissions/settings")
        .set("Cookie", authCookie());
      expect(reread.body.confirmationSubject).toBe("Got it, thanks");
    });

    it("refuses a stale settings version", async () => {
      const first = await request(app)
        .get("/api/v2/admin/contactSubmissions/settings")
        .set("Cookie", authCookie());

      await request(app)
        .put("/api/v2/admin/contactSubmissions/settings")
        .set("Cookie", authCookie())
        .send({ ...first.body, version: 0 });

      const second = await request(app)
        .put("/api/v2/admin/contactSubmissions/settings")
        .set("Cookie", authCookie())
        .send({ ...first.body, version: 0 });

      expect(second.status).toBe(409);
    });
  });

  it("keeps messages out of the published content bundle", async () => {
    await request(app)
      .post("/api/v2/contact/submissions")
      .send(await validBody());

    /* A publish validates the whole content bundle, so the two singletons it
       requires have to exist first -- the same minimum releases.test.ts seeds.
       Without them the publish is a 400 and this test would only prove that an
       invalid release contains no email addresses. */
    await request(app)
      .put("/api/v2/admin/singletons/profile")
      .set("Cookie", authCookie())
      .send({
        data: {
          name: "Harma Davtian",
          title: "Full Stack Engineer",
          email: "harma.davtian@gmail.com",
          phone: "818.632.1804",
          location: "Glendale, CA",
          summary: "Full stack engineer.",
        },
        version: 0,
      })
      .expect(200);

    await request(app)
      .put("/api/v2/admin/singletons/cosmosIntroduction")
      .set("Cookie", authCookie())
      .send({
        data: {
          title: "The Harma System",
          subtitle: "A Digital Galaxy",
          description: "Welcome to the Harma System.",
        },
        version: 0,
      })
      .expect(200);

    const published = await request(app)
      .post("/api/v2/admin/releases/publish")
      .set("Cookie", authCookie())
      .send({ notes: "with a contact message in the database" });

    /* Asserted, not skipped on a non-201. An earlier version of this test
       posted to the wrong path, got a 404 and passed anyway -- a guard that
       quietly checks nothing is worse than no guard. */
    expect(published.status).toBe(201);

    const bundle = await request(app).get("/api/v2/content/resume");
    expect(bundle.status).toBe(200);

    // A release is a reviewable description of the *site*, and it must not grow
    // by one entry every time a stranger writes in. If submissions are ever
    // added to collectionSchemas, this is what fails.
    for (const body of [published.body, bundle.body]) {
      const serialised = JSON.stringify(body);
      expect(serialised).not.toContain("visitor@example.com");
      expect(serialised).not.toContain("cosmos scene");
      expect(serialised).not.toContain("contactSubmissions");
    }
  });
  },
);
