import Image from "next/image";
import SignUp from "./sign-up-form";

export default function Page() {
  return (
    <div className="w-4/5 max-w-2xl mx-auto my-12">
      <Image
        src="/image/bam.png"
        alt="Bangers and Mash GBG"
        width={200}
        height={200}
        className="mx-auto"
      />
      <SignUp />
    </div>
  );
}
