import { AssuranceWorkspace } from "../ui/assurance-workspace";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string }>;
}) {
  const { receipt } = await searchParams;
  return <AssuranceWorkspace initialReceiptId={receipt} surface="receipts" />;
}
