import PeoplePage from "./PeoplePage";

export default async function PeopleIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  await searchParams;
  return <PeoplePage />;
}
