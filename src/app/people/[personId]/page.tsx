import PersonDetailPage from "./PersonDetailPage";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  return <PersonDetailPage personId={personId} />;
}
