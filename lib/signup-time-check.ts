import eventConfig from "@/event-dates.json";
import { z } from "zod";

export type SignupStatus = { blocked: boolean; message?: string };

export const signupFormSchema = z.object({
  name: z.string().min(2, { error: "Name is required" }).max(50, { error: "Name is too long" }),
  email: z.email({ error: "Email is invalid" }),
  dob: z.date({ error: "Birthday is required" }),
});

export function getSignupDateBounds(currentTime: Date): { youngestDate: Date; oldestDate: Date } {
  const youngestDate = new Date(currentTime);
  youngestDate.setFullYear(currentTime.getFullYear() - 20);
  const oldestDate = new Date(currentTime);
  oldestDate.setFullYear(currentTime.getFullYear() - 100);

  return { youngestDate, oldestDate };
}

export function isSignupBlocked(currentTime: Date): SignupStatus {
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
    if (currentTime >= blockStart && currentTime < blockEnd) {
      return {
        blocked: true,
        message: eventConfig.message,
      };
    }
  }

  return { blocked: false };
}
