# Event Dates Management Guide

## How to Block Sign-ups on Event Days

The sign-up form automatically closes at 3pm on specified event dates to prevent last-minute registrations.

### Managing Event Dates

1. Open the `event-dates.json` file in the project root
2. Add or remove dates in the `eventDates` array
3. Use the format `YYYY-MM-DD` (e.g., "2024-12-25" for December 25, 2024)

### Example Configuration

```json
{
  "eventDates": ["2025-09-05", "1999-01-01"],
  "cutoffTime": "15:00",
  "message": "Sign-ups are closed for today's event. Please come back tomorrow."
}
```

### Important Notes

- The cutoff time is set to 3pm (15:00) by default
- Sign-ups will automatically reopen at midnight after an event day
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
