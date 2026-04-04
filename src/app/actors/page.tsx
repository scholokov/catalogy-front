import { redirect } from "next/navigation";

export default function ActorsIndexPage() {
  redirect("/people?role=acting");
}
