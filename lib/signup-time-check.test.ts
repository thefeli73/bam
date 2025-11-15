import { isSignupBlocked } from "./signup-time-check";

// Test helper to check different scenarios
function testScenario(description: string, date: Date, expected: boolean) {
  const result = isSignupBlocked(date);
  const status = result.blocked === expected ? "✅ PASS" : "❌ FAIL";
  console.log(`${status} ${description}`);
  console.log(`  Expected blocked: ${String(expected)}, Got: ${String(result.blocked)}`);
  if (result.message) {
    console.log(`  Message: ${result.message}`);
  }
  console.log();
}

// Run tests
console.log("Testing signup blocking logic...\n");

// October 25, 2025 at 22:00 (before cutoff)
testScenario("Oct 25 at 22:00 - Before cutoff", new Date("2025-10-25T22:00:00"), false);

// October 25, 2025 at 23:00 (exactly at cutoff)
testScenario("Oct 25 at 23:00 - At cutoff time", new Date("2025-10-25T23:00:00"), true);

// October 25, 2025 at 23:30 (during block period)
testScenario("Oct 25 at 23:30 - During block period", new Date("2025-10-25T23:30:00"), true);

// October 26, 2025 at 02:00 (3 hours into block)
testScenario("Oct 26 at 02:00 - 3 hours into block", new Date("2025-10-26T02:00:00"), true);

// October 26, 2025 at 04:59 (just before block ends)
testScenario("Oct 26 at 04:59:59 - Just before block ends", new Date("2025-10-26T04:59:59"), true);

// October 26, 2025 at 05:00 (block period over)
testScenario("Oct 26 at 05:00 - Block period ended", new Date("2025-10-26T05:00:00"), false);

// October 26, 2025 at 12:00 (well after block)
testScenario("Oct 26 at 12:00 - Well after block", new Date("2025-10-26T12:00:00"), false);

// Random non-event date
testScenario("Oct 20 at 23:00 - Non-event date", new Date("2025-10-20T23:00:00"), false);
