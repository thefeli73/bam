"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { signupFormSubmit } from "@/lib/actions";
import type { SignupResult } from "@/lib/signup";
import { signupFormClientSchema, type SignupStatus } from "@/lib/signup-time-check";
import { cn } from "@/lib/utils";

import { useSignupAnalytics } from "./use-signup-analytics";

type SignUpProps = {
  initialStatus: SignupStatus;
  oldestDateIso: string;
  youngestDateIso: string;
};

type SignupFormValues = z.infer<typeof signupFormClientSchema>;

export default function SignUp({ initialStatus, oldestDateIso, youngestDateIso }: SignUpProps) {
  const analytics = useSignupAnalytics(initialStatus.blocked);
  const [response, setResponse] = useState<SignupResult | null>(null);
  const [dobOpen, setDobOpen] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownMinutes, setCooldownMinutes] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const dobTriggerRef = useRef<HTMLButtonElement>(null);
  const focusEmailAfterResetRef = useRef(false);
  const oldestDate = parseISO(oldestDateIso);
  const youngestDate = parseISO(youngestDateIso);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormClientSchema),
    defaultValues: {
      name: "",
      email: "",
      dob: undefined,
    },
  });
  const pending = form.formState.isSubmitting;

  async function onSubmit(values: SignupFormValues) {
    setResponse(null);
    try {
      analytics.trackSubmitted();
      const result = await signupFormSubmit({ ...values, dob: format(values.dob, "yyyy-MM-dd") });
      analytics.trackResult(result);
      const retryAfterMs = result.status === "rate-limited" ? result.retryAfterSeconds * 1000 : 0;
      const now = Date.now();
      const deadline = now + retryAfterMs;

      if (
        result.status === "rate-limited" &&
        Number.isSafeInteger(result.retryAfterSeconds) &&
        result.retryAfterSeconds > 0 &&
        Number.isSafeInteger(retryAfterMs) &&
        Number.isSafeInteger(deadline)
      ) {
        setCooldownUntil(deadline);
        setCooldownMinutes(Math.ceil(result.retryAfterSeconds / 60));
      } else {
        setCooldownUntil(null);
        setCooldownMinutes(null);
      }
      setResponse(result);
    } catch {
      analytics.trackServerError();
      setCooldownUntil(null);
      setCooldownMinutes(null);
      setResponse({
        status: "error",
        message: "An error occurred while trying to sign up. Please try again.",
      });
    }
  }

  function resetForm() {
    focusEmailAfterResetRef.current = true;
    form.reset();
    setDobOpen(false);
    setResponse(null);
    setCooldownUntil(null);
    setCooldownMinutes(null);
  }

  useEffect(() => {
    if (response) resultRef.current?.focus();
  }, [response]);

  useEffect(() => {
    if (!response && focusEmailAfterResetRef.current) {
      focusEmailAfterResetRef.current = false;
      form.setFocus("email");
    }
  }, [form, response]);

  useEffect(() => {
    if (cooldownUntil === null) return;

    let timeoutId: number;
    const updateCooldown = () => {
      const remainingMs = cooldownUntil - Date.now();
      if (remainingMs <= 0) {
        setCooldownUntil(null);
        setCooldownMinutes(null);
        setResponse((current) => (current?.status === "rate-limited" ? null : current));
        return;
      }

      const remainingMinutes = Math.ceil(remainingMs / 60_000);
      setCooldownMinutes(remainingMinutes);
      const untilNextMinute = remainingMs - (remainingMinutes - 1) * 60_000;
      timeoutId = window.setTimeout(updateCooldown, untilNextMinute);
    };

    updateCooldown();
    return () => window.clearTimeout(timeoutId);
  }, [cooldownUntil]);

  const cooldownLabel = cooldownMinutes ? `${cooldownMinutes} ${cooldownMinutes === 1 ? "minute" : "minutes"}` : null;

  if (initialStatus.blocked && !response) {
    return (
      <div className="rounded-lg border bg-orange-50 p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-orange-900">Sign-ups Temporarily Closed</h2>
        <p className="text-orange-800">{initialStatus.message}</p>
      </div>
    );
  }

  if (response?.status === "blocked") {
    return (
      <div ref={resultRef} aria-live="polite" tabIndex={-1} className="rounded-lg border bg-orange-50 p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-orange-900">Sign-ups Temporarily Closed</h2>
        <p className="text-orange-800">{response.message}</p>
      </div>
    );
  }

  if (response?.status === "success") {
    return (
      <div className="flex flex-col items-start gap-4">
        {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- The shared focus target is a result region, not a form output value. */}
        <div ref={resultRef} role="status" aria-live="polite" tabIndex={-1}>
          {response.message}
        </div>
        <Button type="button" variant="outline" onClick={resetForm}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      {response && (
        <div className="mb-8 flex flex-col items-start gap-4">
          <div ref={resultRef} role="alert" tabIndex={-1} className="text-sm font-medium text-destructive-text">
            {response.status === "rate-limited" && cooldownLabel
              ? `Too many signup attempts. Try again in ${cooldownLabel}.`
              : response.message}
          </div>
          <Button type="button" variant="outline" onClick={resetForm}>
            Go back
          </Button>
        </div>
      )}
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form
        method="post"
        onFocusCapture={analytics.trackStarted}
        onInvalidCapture={analytics.trackNativeInvalid}
        onSubmit={form.handleSubmit(onSubmit, analytics.trackValidationFailed)}
        className="space-y-8"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="name@example.com"
                  {...field}
                />
              </FormControl>
              <FormDescription>We will contact you here with information about events.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="name" required maxLength={50} placeholder="Firstname Lastname" {...field} />
              </FormControl>
              <FormDescription>Please enter your full name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dob"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Date of birth</FormLabel>
              <Popover open={dobOpen} onOpenChange={setDobOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      ref={(element) => {
                        field.ref(element);
                        dobTriggerRef.current = element;
                      }}
                      type="button"
                      variant="outline"
                      aria-label={
                        field.value
                          ? `Date of birth (required): ${format(field.value, "PPP")}. Change date`
                          : "Date of birth (required): Pick a date"
                      }
                      className={cn(
                        "w-full pl-3 text-left font-normal sm:w-[240px]",
                        !field.value && "text-muted-foreground",
                      )}
                    >
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent
                  aria-label="Choose date of birth"
                  className="max-h-[calc(100vh-2rem)] w-auto max-w-[calc(100vw-2rem)] overflow-auto p-0"
                  align="start"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    dobTriggerRef.current?.focus();
                  }}
                >
                  <Calendar
                    required
                    mode="single"
                    showOutsideDays={false}
                    selected={field.value}
                    onSelect={(date) => {
                      if (date) {
                        field.onChange(date);
                        setDobOpen(false);
                      }
                    }}
                    defaultMonth={field.value}
                    startMonth={oldestDate}
                    endMonth={youngestDate}
                    disabled={[{ before: oldestDate }, { after: youngestDate }]}
                    captionLayout="dropdown"
                    hideNavigation
                  />
                </PopoverContent>
              </Popover>
              <FormDescription>You must be at least 20 to sign up.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending || cooldownUntil !== null || initialStatus.blocked}>
          {pending ? "Submitting…" : cooldownLabel ? `Try again in ${cooldownLabel}` : "Submit"}
        </Button>
      </form>
    </Form>
  );
}
