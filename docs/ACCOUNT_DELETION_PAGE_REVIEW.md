# Account & Data Deletion page — replacement for review

**Not for publication.** Keep the current `/delete-account` page until the deployed deletion behavior, retained records and request process are verified and this text is approved. This copy is intended for both the public page and the app's deletion help link.

## Delete through the app

Sign in to MedVeda, open Settings and select Delete Account. Confirm the request. The app sends the request for your signed-in account. If it reports a failure, try again or contact support; a failure may occur after part of the server work has already completed. Deleting your account ends access to digital materials bought through it. This action cannot be undone.

## Request deletion outside the app

Email medvedaforu@gmail.com with the subject “Delete my MedVeda account” from your registered email address. If you no longer have access to it, explain that in your message so support can arrange another identity check. Do not include your password, payment card information or UPI PIN. [Owner: verify that this mailbox is monitored, how identity is checked, who performs deletion, how requests are tracked and the approved response time.]

## Data affected

The current server source removes the Auth account, profile, quiz scores, usage events, push tokens, payment sessions, purchases and referral relationships. It removes access to bought content. It unlinks the direct account ID from order and payment rows but retains transaction details. Newer wallet, reservation, fraud-prevention and payment audit records need separate review and may remain linked indirectly. Data stored on your phone may remain until you clear app storage or uninstall the app. [Replace with the tested production behavior after the approved cleanup.]

## Records that may remain

MedVeda may need some payment, refund, fraud-prevention, security, support or accounting records to meet an obligation or resolve a dispute. Provider records and backups follow their own verified retention settings. The categories, exact fields and duration must be reviewed before making a public promise. Contact support if you need help understanding a retained record.

## Completion

The app should report success after server confirmation. For email requests, support should confirm receipt and completion separately. [Owner: approve a time frame backed by the operational process.] If an account is already closed, support should still investigate any remaining linked records rather than assuming that a missing Auth row proves complete erasure.
