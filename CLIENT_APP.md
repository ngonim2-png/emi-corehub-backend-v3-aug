# EMI Client App (mobile web app for clients)

Served by this backend at **/app/** (same address as the API, no extra hosting).
Clients open the link on their phone and use "Add to Home Screen" to install it.

## Render environment variables
| Name | What |
|---|---|
| PORTAL_JWT_SECRET | long random text; signs client-app sessions (must differ from the staff secrets) |
| VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY | push-notification keys (`npx web-push generate-vapid-keys`). Without them the app works but phones get no push (inbox still works) |
| VAPID_SUBJECT | e.g. mailto:admin@enhancedmutual.sl |
| APP_OFFICE_PHONE / APP_OFFICE_WHATSAPP / APP_OFFICE_ADDRESS | shown in the app's "Call the office" buttons |

## After deploying
Run the migration once: `npx typeorm migration:run -d dist/config/typeorm.cli.js`
(adds the app tables and the new claim/loan/product columns).

## Staff side
CoreHub -> **Client app** (Supreme Admin / Super Admin; Underwriting Officer sees Requests and Activation codes).

## Login
- Existing client, first time: policy number + the phone number the company holds + choose a PIN twice. (No SMS. Only works while the policy has no app account yet; 5 wrong guesses per policy lock this for an hour.)
- Existing client afterwards: policy number + PIN.
- Forgot PIN / phone number changed: SMS code (or a code issued by staff in CoreHub -> Client app -> Activation codes), then a new PIN twice.
- New applicant: phone number + PIN chosen twice at registration; afterwards phone + PIN. After approval and first premium they log in as a client with their policy number and the same PIN.
