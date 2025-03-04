"use server";

import { z } from "zod";
import { oldestDate, signupFormSchema, youngestDate } from "@/app/sign-up-form";
import listmonk, { listmonkData } from "./listmonk";

export async function signupFormSubmit(data: z.infer<typeof signupFormSchema>): Promise<string> {
  if (data.dob > youngestDate || data.dob < oldestDate) {
    return "Invalid date of birth";
  }
  const offset = data.dob.getTimezoneOffset();
  data.dob = new Date(data.dob.getTime() - offset * 60 * 1000);

  const listmonkData: listmonkData = {
    email: data.email,
    name: data.name,
    status: "enabled",
    lists: [6],
    attribs: {
      dob: data.dob.toISOString().split("T")[0],
    },
  };
  return await listmonk(listmonkData);
}
