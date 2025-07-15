import eventConfig from "@/event-dates.json";

export function isSignupBlocked(): { blocked: boolean; message?: string } {
  const now = new Date();
  const currentDate = now.toISOString().split("T")[0]; // YYYY-MM-DD format
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

  // Check if today is an event date
  const isEventDay = eventConfig.eventDates.includes(currentDate);

  if (isEventDay) {
    // Check if current time is after the cutoff time (default 15:00 / 3pm)
    const cutoffTime = eventConfig.cutoffTime || "15:00";
    if (currentTime >= cutoffTime) {
      return {
        blocked: true,
        message: eventConfig.message,
      };
    }
  }

  return { blocked: false };
}
