import { redirect } from "next/navigation";

export default function Home() {
  // MVP entry point is uploading a book (user journey step 1).
  redirect("/upload");
}
