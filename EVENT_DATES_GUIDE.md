# Event Dates Management Guide

## How to Block Sign-ups on Event Days

The sign-up form closes at the configured `cutoffTime` on specified event dates. It reopens after the configured `blockDurationHours`.

### Managing Event Dates

1. Open the `event-dates.json` file in the project root
2. Add or remove dates in the `eventDates` array
3. Use the format `YYYY-MM-DD` (e.g., "2024-12-25" for December 25, 2024)

### Example Configuration

```json
{
  "eventDates": ["2026-05-09", "1999-01-01"],
  "cutoffTime": "23:00",
  "blockDurationHours": 6,
  "message": "Sign-ups are closed for today's event. Please come back tomorrow."
}
```

### Important Notes

- `cutoffTime` sets when the block starts on each event date
- `blockDurationHours` sets how long sign-ups remain blocked
- Users will see a friendly message when sign-ups are closed
- The time zone follows the server's local time

### Adding New Event Dates

Simply add a new date to the array:

```json
"eventDates": [
  "2024-12-25",
  "2024-12-31",
  "2025-01-15",
  "2025-02-14",
  "2025-03-20"  // <- New date added
]
```

Remember to save the file after making changes!
