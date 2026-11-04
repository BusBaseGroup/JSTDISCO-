# JST Mobile Disco

The customer pages live in `public/`, and the owner login, bookings dashboard and enquiry form are handled by `worker/index.js`.

## Put the source on GitHub

1. Create an empty private repository in your GitHub account. Skip the README and licence options when creating it.
2. Unzip the source, open a terminal in that folder and run the following, substituting your own repository URL.

```sh
git init -b main
git add .
git commit -m "Add JST Mobile Disco website"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

GitHub stores a copy of your source. The live site uses ChatGPT Sites for login, hosting and storage. GitHub Pages serves static files and cannot run the booking form or owner dashboard. Pushes to your GitHub copy do not publish to the live site.

## Build check

```sh
python3 scripts/build.py
node scripts/validate-artifact.mjs
```

## Owner login and SMS

Use `/login` with an approved ChatGPT account. The hosting configuration provides a private R2 bucket bound as `BUCKET`. Keep the existing bucket connected when deploying updates so older enquiries remain available.

The owner allowlist and Twilio credentials belong in the hosted environment as secrets. Keep them out of GitHub.

| Key | Value |
| --- | --- |
| OWNER_EMAILS | Comma-separated approved ChatGPT account emails |
| BOOKING_SMS_TO | Owner mobile number in international format, e.g. +447… |
| TWILIO_ACCOUNT_SID | Twilio account SID |
| TWILIO_AUTH_TOKEN | Twilio auth token |
| TWILIO_FROM_NUMBER | SMS-capable Twilio sender number |

When all four SMS settings are present, submit a test enquiry with dummy details and confirm delivery on your phone. Twilio trial accounts require a verified recipient. SMS usage may be charged by Twilio. The enquiry saves first, and a provider error leaves it available in the dashboard. The dashboard's configured label indicates credentials are present. Check the phone for actual delivery.

[Twilio messaging documentation](https://www.twilio.com/docs/messaging/api/message-resource)
