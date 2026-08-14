import { GraphDetail } from "../ui/graph-detail";

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string }>;
}) {
  const { node } = await searchParams;
  return <GraphDetail initialNodeId={node ?? "req-auth"} />;
}
