import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutForm } from "@/modules/admin/auth_forms";
import { InterestedLeads } from "@/modules/admin/interested_leads";
import { loadInterestedLeads } from "@/modules/admin/interested_leads.server";

export default async function InterestedLeadsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
  const page = rawPage && /^[1-9]\d{0,4}$/.test(rawPage) ? Number(rawPage) : 1;
  const result = await loadInterestedLeads(page);
  if (result.status === "anonymous") redirect("/admin/login");
  if (result.status === "unassigned") redirect("/admin/onboarding");
  return <>
    <header className="admin-heading"><h1>Interessados</h1><LogoutForm /></header>
    {result.status === "error" && <p role="alert">Não foi possível carregar os interessados. Tente novamente mais tarde.</p>}
    {result.status === "ready" && <>
      <InterestedLeads leads={result.leads} />
      <nav aria-label="Páginas de interessados" className="admin-pagination">
        {page > 1 && <Link prefetch={false} href={`/admin/interessados?page=${page - 1}`}>Anterior</Link>}
        <span>Página {page}</span>
        {result.hasNext && <Link prefetch={false} href={`/admin/interessados?page=${page + 1}`}>Próxima</Link>}
      </nav>
    </>}
  </>;
}
