"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { signupFormSubmit } from "@/lib/actions";
import { useState } from "react";

export const signupFormSchema = z.object({
  name: z.string().min(2, { message: "Name is required" }).max(50, { message: "Name is too long" }),
  email: z.string().email({ message: "Email is invalid" }),
  dob: z.date({ required_error: "Birthday is required" }),
});
export const youngestDate = new Date(new Date().setFullYear(new Date().getFullYear() - 20));
export const oldestDate = new Date(new Date().setFullYear(new Date().getFullYear() - 100));

export default function SignUp() {
  const [submitted, setSubmitted] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signupFormSchema>>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      dob: undefined,
    },
  });
  async function onSubmit(values: z.infer<typeof signupFormSchema>) {
    setSubmitted(true);
    setResponse(await signupFormSubmit(values));
  }
  function SignupForm() {
    return (
      <Form {...form}>
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
                <FormDescription>
                  We will contact you here with information about events.
                </FormDescription>
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
                        variant={"outline"}
                        className={cn(
                          "w-[240px] pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
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
                <FormDescription>You must be over 20 to sign up.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={submitted}>
            Submit
          </Button>
        </form>
      </Form>
    );
  }
  return response ?? SignupForm();
}
