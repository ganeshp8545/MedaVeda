# MedVeda legal and deletion implementation checklist

Working checklist, 15 October 2026. Source review only; no production state was inspected.

- [x] Record the pre-existing dirty working tree before edits. App, website, release documents, payment functions and migrations already contain uncommitted work; preserve those changes.
- [x] Read the published-source Terms, Privacy, Refund and deletion pages and both private privacy planning documents.
- [x] Trace app registration, legal navigation, deletion, database cleanup and the website email request path.
- [x] Inventory Play Billing, Razorpay, package references and the current deletion gaps without changing payment code.
- [x] Prepare review-only Terms, Data Safety worksheet and deletion proposal.
- [ ] Obtain legal approval of adult eligibility wording, minor-data response, operator contact/address, grievance commitments and retention basis.
- [ ] Verify the production Supabase schema, deployed Edge Function, cron jobs, backups, provider settings, email request handling and a staging deletion with isolated accounts.
- [ ] Verify Play Console package, all distributed artifacts, Data Safety answers, target audience, SDK payloads and public URLs.
- [ ] Publish one approved, dated Terms and Privacy version across app and website; validate the deployed pages and submit Console declarations manually.

Safe local changes in this pass: correct factual package labels in legal-page source/output; clarify the in-app deletion confirmation; prepare private review files. Do not run a website-wide build while unrelated generated HTML is uncommitted.
