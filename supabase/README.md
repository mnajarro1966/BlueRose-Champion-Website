# Activate the Blue's Journey parents' panel

The static site stays on GitHub Pages, including `https://lvbluerose.com/admin/`.
There is no build step. Albums publish directly from Supabase without GitHub access,
commits, or rebuilding Pages. Existing timeline, video, sponsors and milestone cards remain.

## Still required from the site owner

1. A **dedicated Supabase project** owned by the site owner. Its URL and publishable
   key have deliberately not been filled in. No external project was provisioned.
2. Run `supabase/migrations/001_journey.sql` **once** in its SQL Editor. This creates
   the two content tables, editor allowlist, private image bucket, policies and
   publishing function. Do not use a public bucket or add broad access policies.
3. In Authentication settings, enable email authentication and **disable new user
   signups**. Configure production SMTP using your email provider, verify its sender
   domain, and set suitable OTP expiry/rate limits. Supabase's default email service
   is restricted and is not a production delivery solution.
4. In Authentication → Email Templates → **Magic Link**, include the code token:

   ```html
   <h2>Sign in to Blue's Journey</h2>
   <p>Your sign-in code is: {{ .Token }}</p>
   <p>Enter this code in the parents' panel. If you did not request it, ignore this email.</p>
   ```

   The panel uses a typed email OTP, not a redirect or a password. Configure the
   Auth Site URL as `https://lvbluerose.com`. No callback route is required.
5. Obtain each parent's email privately. In Authentication → Users, **create** each
   approved email user through the dashboard (auto-confirm the email if that option
   is shown). No password is used by the panel; do not share dashboard access.
   Add each created user's UUID in the SQL Editor:

   ```sql
   insert into public.journey_editors(user_id) values ('PARENT_AUTH_USER_UUID');
   ```

   Membership is managed only by the project owner. To revoke immediately:

   ```sql
   delete from public.journey_editors where user_id = 'PARENT_AUTH_USER_UUID';
   ```

6. Put only the project URL (`https://PROJECT_REF.supabase.co`) and its
   `sb_publishable_...` key into `journey-config.js`, then commit and push that file.
   A legacy `anon` JWT is supported, but a publishable key is preferred. Never put
   `service_role`, `sb_secret_...`, database passwords, SMTP secrets or GitHub tokens
   in this repository. SMTP credentials belong only in Supabase settings.
7. Ensure GitHub Pages continues serving the root of `master` and the existing custom
   domain with HTTPS. `/admin` redirects to the directory `/admin/` on Pages.
8. Run the activation checks below against the real project before giving parents access.

## Parent workflow

Open `/admin/`, enter the invited email and the received code. Create a tournament,
fill in name/date/location/result, and select multiple photos. Save the private draft,
preview the card and full album, then choose **Publish to Blue's Journey**. A new
public page load displays it immediately. Existing visitors can refresh to see it.
To change a published album, choose **Return to draft**, edit, save, preview and republish.
The first selected photo is the cover; remove it to use the next photo instead.

Up to 20 photos per album. Original JPEG/PNG/WebP files may be up to 20 MB; the browser
resizes to a maximum 2400px edge and encodes fresh JPEGs without original EXIF/GPS
metadata. HEIC is explicitly rejected with conversion instructions. Stored files are
limited by the bucket to 8 MB JPEG. An interrupted save leaves a private draft and
shows an error; retry in the same tab without duplicating completed uploads. After
closing/reloading a failed upload, reopen the saved draft and reselect missing photos.
Unattached uploaded objects remain private and can be cleaned up by the owner through
Storage; do not directly delete storage objects with SQL.

## Security model

- `/admin/` is a static page and its source is publicly readable, like all GitHub
  Pages assets. Private data and changes require Supabase authorization. Parents get
  no repository, GitHub, Supabase dashboard, or other site-management permissions.
- Every write checks a server-owned `journey_editors` table. An authenticated account
  without membership cannot create, change, upload, or publish. Parents cannot grant
  membership. Use a dedicated project so unrelated tables/buckets are outside this app.
- Anonymous reads see published albums and their attached photos only. Draft images
  live in a **private** bucket. URLs are signed for one hour; unpublishing prevents new
  public URLs, but URLs already issued can work until expiry. Publicly shared images
  can be downloaded by visitors, so returning to draft cannot recall copies.
- Publication runs through a restricted database function that locks the album and
  verifies uploaded photos. Clients cannot directly set `published`. Published albums
  are read-only until returned to draft. Album/photo constraints also apply to direct API calls.
- Sessions persist in browser **sessionStorage**, not permanent localStorage. Signing
  out clears the local session. Closing the tab normally removes it, although browser
  session restore may preserve it; use Sign out on shared devices.
- User-entered tournament text is rendered with `textContent`, never injected as HTML.
  The admin has a restrictive CSP and a locally pinned Supabase client, no analytics.
- Owner-level operations can override policies; protect the owner's Supabase account.

## Activation acceptance checks (real Supabase)

Use two browser sessions: an invited parent and a signed-out/private window.

1. Invited parent receives a code and logs in. Invalid/expired code fails. A signed-in
   nonmember is rejected, including direct API writes. Disabled signup blocks new users.
2. Create and save a tournament with several phone photos; reopen the draft after
   reloading. Check orientation, all metadata, photo order, cover and full-size preview.
3. Before publishing, verify anonymous REST queries return no draft records and both
   Storage downloads and signing draft paths are denied. Anonymous and nonmember
   album/photo/storage writes and publish RPC must fail. Editing the membership table
   or directly updating `published` as a parent must fail.
4. Publish. In the private window, refresh the home page: album metadata and all images
   must appear and keyboard/touch gallery controls must work.
5. Return to draft. Refresh the public page: album disappears and new anonymous photo
   signatures fail. Check the documented one-hour lifetime for old signed URLs.
6. Disable network during an upload; confirm error, no partial public album, and retry
   without duplicate photos. Sign out/in and verify saved drafts survive.
7. Revoke the parent's allowlist UUID; subsequent reads of drafts, writes and publishing
   must fail even with an existing session.

## Development verification

Install development tools with `pnpm install --frozen-lockfile`, install a test browser
with `pnpm exec playwright install chromium`, and run `pnpm test`. Alternatively set
`PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chromium/Edge executable. `pnpm preview`
serves the unchanged static source at `http://127.0.0.1:4173/admin/`.
These tools are for local verification only; GitHub Pages needs no Node runtime.

Browser tests use a simulated Supabase API, never production credentials. Database
tests use PGlite with minimal Supabase auth/storage schemas to exercise actual PostgreSQL
RLS, grants and functions. They do not validate the hosted email service or Storage HTTP
implementation. Run both and then the real-project checks above during activation.

Reference: [Supabase OTP](https://supabase.com/docs/reference/javascript/auth-signinwithotp),
[private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[storage policies](https://supabase.com/docs/guides/storage/security/access-control).
