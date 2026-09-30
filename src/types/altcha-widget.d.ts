/**
 * The ALTCHA widget is a custom element, so TypeScript has to be told it is a
 * legal JSX tag and which attributes it takes.
 *
 * The package ships its own React declarations, so they are referenced rather
 * than hand-written. A hand-written copy was tried first and got the attribute
 * name wrong -- `challengeurl`, which is the v1 name; v3 calls it `challenge`,
 * and it takes either a challenge object or the URL to fetch one from. Nothing
 * caught it, because a declaration file that invents an attribute type-checks
 * perfectly and simply does not match the element. Using the package's own
 * types means the compiler now checks this against the widget we actually have.
 */
import "altcha/types/react";
