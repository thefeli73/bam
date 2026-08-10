"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { signupFormSubmit } from "@/lib/actions";
import { useState } from "react";
import { signupFormClientSchema, type SignupStatus } from "@/lib/signup-time-check";

type SignUpProps = {
  initialStatus: SignupStatus;
  oldestDateIso: string;
  youngestDateIso: string;
};

export default function SignUp({ initialStatus, oldestDateIso, youngestDateIso }: SignUpProps) {
  const [submitted, setSubmitted] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const oldestDate = parseISO(oldestDateIso);
  const youngestDate = parseISO(youngestDateIso);

  const form = useForm<z.infer<typeof signupFormClientSchema>>({
    resolver: zodResolver(signupFormClientSchema),
    defaultValues: {
      name: "",
      email: "",
      dob: undefined,
    },
  });
  async function onSubmit(values: z.infer<typeof signupFormClientSchema>) {
    setSubmitted(true);
    setResponse(await signupFormSubmit({ ...values, dob: format(values.dob, "yyyy-MM-dd") }));
  }

  // If signup is blocked, show the message
  if (initialStatus.blocked && !response) {
    return (
      <div className="rounded-lg border bg-orange-50 p-6 text-center">
        <p className="text-lg font-semibold text-orange-900 mb-2">Sign-ups Temporarily Closed</p>
        <p className="text-orange-800">{initialStatus.message}</p>
      </div>
    );
  }

  if (response) {
    return response;
  }

  return (
    <Form {...form}>
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="name@example.com" {...field} />
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
                <Input placeholder="Firstname Lastname" {...field} />
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
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      type="button"
                      variant={"outline"}
                      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                      className={cn("w-[240px] pl-3 text-left font-normal", field.value && "text-muted-foreground")}
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    required
                    mode="single"
                    showOutsideDays={false}
                    selected={field.value}
                    onSelect={field.onChange}
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
        <Button type="submit" disabled={submitted || initialStatus.blocked}>
          Submit
        </Button>
      </form>
    </Form>
  );
}
