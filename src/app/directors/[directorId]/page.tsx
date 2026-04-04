import { redirect } from "next/navigation";

export default async function DirectorPage({
  params,
}: {
  params: Promise<{ directorId: string }>;
}) {
  const { directorId } = await params;
  redirect(`/people/${directorId}`);
}
