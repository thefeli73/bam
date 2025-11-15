import eventConfig from "@/event-dates.json";

export function isSignupBlocked(currentTime?: Date): { blocked: boolean; message?: string } {
  const now = currentTime ?? new Date();
  const cutoffTime = eventConfig.cutoffTime || "15:00";
  const blockDurationHours = eventConfig.blockDurationHours || 6;

  // Check each event date to see if we're in a block period
  for (const eventDate of eventConfig.eventDates) {
    // Parse the event date and cutoff time in local timezone
    const [year, month, day] = eventDate.split("-").map(Number);
    const [hours, minutes] = cutoffTime.split(":").map(Number);
    const blockStart = new Date(year, month - 1, day, hours, minutes, 0, 0);

    // Calculate when the block period ends (using wall-clock hours to handle DST correctly)
    const blockEnd = new Date(blockStart);
    blockEnd.setHours(blockStart.getHours() + blockDurationHours);

    // Check if current time is within the block period
    if (now >= blockStart && now < blockEnd) {
      return {
        blocked: true,
        message: eventConfig.message,
      };
    }
  }

  return { blocked: false };
}
