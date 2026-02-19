"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChevronProps, DayPicker, DropdownProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CustomChevron(props: ChevronProps) {
  if (props.orientation === "left") {
    return <ChevronLeft className="h-4 w-4" {...props} />;
  }
  return <ChevronRight className="h-4 w-4" {...props} />;
}

function CustomSelectDropdown(props: DropdownProps) {
  const { options, value, onChange } = props;

  const handleChange = (value: string) => {
    if (onChange) {
      const changeEvent = {
        target: { value: value },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(changeEvent);
    }
  };

  return (
    <Select value={value?.toString()} onValueChange={handleChange}>
      <SelectTrigger className="inline-flex w-2/5 mx-2 mt-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options?.map((option) => (
          <SelectItem key={option.value} value={option.value.toString()} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex flex-col justify-center pt-1 relative items-stretch space-x-4 w-full",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1 top-1"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1 top-1"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative rounded-md font-normal text-[0.8rem] [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50  first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        range_end: "day-range-end",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: CustomChevron,
        Dropdown: CustomSelectDropdown,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
