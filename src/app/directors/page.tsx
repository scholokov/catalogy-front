import { redirect } from "next/navigation";

export default function DirectorsIndexPage() {
  redirect("/people?role=directing");
}
