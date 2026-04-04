import { redirect } from "next/navigation";

export default async function ActorPage({
  params,
}: {
  params: Promise<{ actorId: string }>;
}) {
  const { actorId } = await params;
  redirect(`/people/${actorId}`);
}
