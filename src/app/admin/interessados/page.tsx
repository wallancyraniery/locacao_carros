import { loadCentralContext } from "@/modules/central/access.server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CentralShell } from "@/modules/central/shell";
import { InterestedLeads } from "@/modules/admin/interested_leads";
import { loadInterestedLeads } from "@/modules/admin/interested_leads.server";

export default async function InterestedLeadsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
  const page = rawPage && /^[1-9]\d{0,4}$/.test(rawPage) ? Number(rawPage) : 1;
  const result = await loadInterestedLeads(page);
  if (result.status === "anonymous") redirect("/admin/login");
  if (result.status === "unassigned") redirect("/admin/onboarding");
  const context = result.status === "ready" ? await loadCentralContext() : null;
  return <CentralShell name={context?.status === "ready" ? context.organization.name : undefined} email={context?.status === "ready" ? context.email : undefined} role={context?.status === "ready" ? context.role : undefined} title="Interessados" current="/admin/interessados">
    {result.status === "error" && <p role="alert">Não foi possível carregar os interessados. Tente novamente mais tarde.</p>}
    {result.status === "ready" && <>
      <InterestedLeads leads={result.leads} />
      <nav aria-label="Páginas de interessados" className="admin-pagination">
        {page > 1 && <Link prefetch={false} href={`/admin/interessados?page=${page - 1}`}>Anterior</Link>}
        <span>Página {page}</span>
        {result.hasNext && <Link prefetch={false} href={`/admin/interessados?page=${page + 1}`}>Próxima</Link>}
      </nav>
    </>}
  </CentralShell>;
}
