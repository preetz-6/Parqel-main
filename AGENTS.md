<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Parqel

Closed-campus parking accountability. **Read `docs/DESIGN.md` before changing
anything non-trivial** — it records what this system deliberately refuses to
do and why, which is not recoverable from the code.

The short version of what will bite you:

- **No self-registration, ever.** Both auth paths must resolve to an existing
  roster user. This is what keeps plate-to-owner mapping trustworthy.
- **No public feed of violations.** Alerts are private between the two
  parties. A public feed is a stalking tool and a DPDP problem.
- **No fines, no SMS/voice, no automatic parking sessions in v1.** These are
  cut deliberately, not missing. See `docs/DESIGN.md` §3 and §5.
- **Two-wheeler zones have no spot rows** — capacity only. But two-wheelers
  are first-class for violations and alerts.
- **Authorization never goes in `proxy.ts`.** It lives in `src/server/dal.ts`
  next to the data. See `docs/ROLES.md` §6.
- **Route Handlers must set cookies on the response object**, not via the
  `cookies()` store — that fails silently with a 200 and no cookie.

Roles, the permission matrix and the four integrity rules: `docs/ROLES.md`.
The tests in `src/server/permissions.test.ts` are the specification — if you
change the matrix, change them in the same commit.

Prisma 7 and Next 16 both differ substantially from most training data
(driver adapters required, `middleware` → `proxy`, async request APIs).
`docs/DESIGN.md` §8 lists the specifics.
