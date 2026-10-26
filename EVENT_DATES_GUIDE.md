# Event Dates and Ticket Email Guide

## Edit the event configuration

Open `event-dates.jsonc` in the project root. Follow its inline comments. JSONC supports comments and trailing commas. The application validates this file when it loads. Invalid dates, settings, unknown fields, or non-HTTPS ticket URLs cause a configuration error.

```jsonc
{
  // Use YYYY-MM-DD. Array order does not matter.
  "eventDates": ["2026-08-29", "2026-05-09"],
  "cutoffTime": "23:00",
  "blockDurationHours": 6,
  "timeZone": "Europe/Stockholm",
  "message": "Sign-ups are closed for today's event.",
  // Replace this with the HTTPS ticket URL for the latest event.
  "ticketUrl": null,
}
```

- `eventDates` sets the dates when sign-ups close.
- `cutoffTime` sets the local closure time on each event date, in 24-hour `HH:mm` format.
- `blockDurationHours` sets the closure length in civil wall-clock hours. The form reopens after this interval.
- `timeZone` must be an IANA time zone name. Event cutoffs and age checks use this time zone.
- `message` is shown while sign-ups are closed.
- `ticketUrl` is an optional HTTPS URL. Set it to `null`, or remove it, to disable ticket emails. An empty `eventDates` array also disables ticket emails.

Commit configuration changes through the normal Git workflow. Rebuild and deploy the application to include them in the production artifact. Restart the development server after edits. These settings are not a live configuration service.

## Ticket email window

The ticket URL belongs to the **latest chronological event date**, not the last array entry. An eligible signup can receive it before that event's `cutoffTime` in `timeZone`. The server checks this window after subscriber creation or recovery, immediately before requesting the ticket email.

At the exact cutoff, ticket emails stop. They remain stopped for that event even after the form reopens following the six-hour closure. Earlier event dates do not change the latest event's ticket expiry.

If clocks repeat the cutoff time, ticket emails stop at its first occurrence and remain stopped after the clock moves backward. If clocks skip the cutoff time, emails stop when the clock first passes it. These rules do not change the signup closure policy.

**When you add a newer event date, replace or clear `ticketUrl` in the same update.** Otherwise, the old URL becomes active for the newer event.

The current event dates are all in the past and `ticketUrl` is `null`. Ticket emails are intentionally off until a new event and its URL are configured.

## Configure Listmonk

Before enabling ticket emails:

1. Use transactional template **6** in Listmonk. Set its subject and use the HTML body below. The application uses the template subject and Listmonk's global sender address, not a template-specific sender.
2. Set the server runtime environment variable `LISTMONK_TICKET_TEMPLATE_ID=6`.
3. Keep the existing `LISTMONK_URL`, `LISTMONK_USER`, and `LISTMONK_PASS` configuration. Give the API user permission to create and look up subscribers, update list memberships, request opt-in, and send transactional messages through `/api/tx`.
4. Confirm that the existing Listmonk email messenger and SMTP configuration work. The application does not provide another mail service.
5. Confirm that the deployed Listmonk version supports the transactional payload: `template_id`, `content_type`, `subscriber_emails`, and `data`. The deployed version is not known from this repository.
6. Rebuild or restart and deploy the application with the configuration and environment changes.

Copy this HTML into template 6. Paragraph tags preserve the spacing, and the anchor makes the ticket URL clickable. Plain text line breaks do not preserve spacing in an HTML email. Editing this guide does not update the live Listmonk template.

```html
<p>Thanks for signing up</p>

<p>Follow the ticket link below to secure your place!</p>

<p>If you buy tickets for anyone else, make sure they are signed up as well. No sign up, no entry.</p>

<p><a href="{{ .Tx.Data.ticket_url }}">{{ .Tx.Data.ticket_url }}</a></p>

<p>See you in the dance</p>

<p>The BAM Crew</p>
```

New accepted subscribers and eligible repeat signups can receive a ticket email. Enabled members of list 3 can receive it while confirmed or unconfirmed; confirmation is not required first. Missing or unsubscribed membership must be added successfully as unconfirmed. Disabled, blocklisted, ambiguous, or unreadable subscriber state does not receive a ticket. Existing opt-in emails remain separate. Opt-in failure does not suppress a ticket for a known eligible member.

Each accepted eligible repeat can request another ticket email. There is no persistent deduplication or application-owned mail queue. Existing validation, age checks, signup closures, and rate limits still apply.

The application waits for Listmonk's response. `{ "data": true }` means the message was accepted into the Listmonk queue, **not that it was delivered**. SMTP, bounce handling, or later queue failures can prevent delivery. A failed ticket request logs a generic error and does not undo a successful registration. Check Listmonk queue and delivery records when investigating mail problems.

## Manual campaign workflow

Automatic ticket emails apply to accepted signups during the active window. They do not send a campaign to all existing subscribers when you configure a URL.

For a bulk announcement, use the existing manual Listmonk campaign workflow:

1. Confirm the event date and current ticket URL.
2. Create a campaign for the intended audience in Listmonk, subject to its subscription and suppression rules.
3. Add the event details and ticket link to the campaign content. The transactional `{{ .Tx.Data.ticket_url }}` value is not supplied to manual campaigns.
4. Preview and test the campaign through the approved operator process, then send or schedule it in Listmonk.
5. Monitor queue, SMTP, and delivery results in Listmonk.

No campaign is created or sent by changing `event-dates.jsonc`.
