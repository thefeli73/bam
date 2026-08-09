import Image from "next/image";
import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";
import { getSignupDateBounds, isSignupBlocked } from "@/lib/signup-time-check";
import SignUp from "./sign-up-form";

export const metadata: Metadata = {
  title: "Sign up | Bangers and Mash GBG",
  description: "Sign up to the Bangers and Mash GBG members list.",
};

export default function Page() {
  return (
    <div className="w-4/5 max-w-2xl mx-auto my-12">
      <Image
        preload
        unoptimized
        src="/image/bam.svg"
        alt="Bangers and Mash GBG"
        width={200}
        height={200}
        className="mx-auto my-8"
      />
      <h1 className="mb-4 text-xl">Sign up to our members list here</h1>
      <Suspense fallback={null}>
        <SignupWithCurrentTime />
      </Suspense>
    </div>
  );
}

async function SignupWithCurrentTime() {
  await io();
  const now = new Date();
  const initialStatus = isSignupBlocked(now);
  const { oldestDate, youngestDate } = getSignupDateBounds(now);

  return (
    <SignUp
      initialStatus={initialStatus}
      oldestDateIso={oldestDate.toISOString()}
      youngestDateIso={youngestDate.toISOString()}
    />
  );
}
