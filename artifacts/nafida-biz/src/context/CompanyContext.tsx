import { createContext, useContext, useState, ReactNode } from "react";
import { useListCompanies } from "@workspace/api-client-react";

export interface Company {
  id: string;
  owner_id: string;
  company_name: string;
  nif_number?: string | null;
  rc_number?: string | null;
  tax_regime?: string | null;
  created_at?: string | null;
}

interface CompanyContextValue {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  isLoading: boolean;
  refetch: () => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { data: companies = [], isLoading, refetch } = useListCompanies();
  const [selectedCompany, setSelectedCompanyState] = useState<Company | null>(null);

  const resolvedSelected =
    selectedCompany && companies.find(c => c.id === selectedCompany.id)
      ? selectedCompany
      : companies.length > 0
      ? (companies[0] as Company)
      : null;

  const setSelectedCompany = (company: Company | null) => {
    setSelectedCompanyState(company);
  };

  return (
    <CompanyContext.Provider
      value={{
        companies: companies as Company[],
        selectedCompany: resolvedSelected,
        setSelectedCompany,
        isLoading,
        refetch,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
