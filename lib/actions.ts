"use server";

import { z } from "zod";
import { oldestDate, signupFormSchema, youngestDate } from "@/app/sign-up/sign-up-form";
import listmonk, { listmonkData } from "./listmonk";

export async function signupFormSubmit(data: z.infer<typeof signupFormSchema>) {
  if (data.dob > youngestDate || data.dob < oldestDate) {
    return { error: "Invalid date of birth" };
  }
  const listmonkData: listmonkData = {
    email: data.email,
    name: data.name,
    status: "enabled",
    lists: [6],
    attribs: {
      dob: data.dob.toISOString(),
    },
  };
  listmonk(listmonkData);
}
