import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useGetProfile } from "@workspace/api-client-react";
import { useCompany } from "@/context/CompanyContext";
import { OnboardingModal } from "@/components/OnboardingModal";

export function NotificationBanner() {
  const { data: profile, isLoading: profileLoading } = useGetProfile();
  const { companies, isLoading: companiesLoading } = useCompany();
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  if (profileLoading || companiesLoading || dismissed) return null;

  const needsOnboarding = !profile?.first_name || companies.length === 0;
  if (!needsOnboarding) return null;

  return (
    <>
      <div
        className="sticky top-0 z-40 bg-orange-500 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg cursor-pointer"
        onClick={() => setModalOpen(true)}
        data-testid="banner-onboarding"
      >
        <div className="flex items-center gap-3 flex-1">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium text-sm">
            أكمل ملفك الشخصي وسجّل شركتك الأولى لبدء استخدام نافذة بيز بشكل كامل.
            <span className="underline font-bold mr-2 cursor-pointer">انقر هنا للبدء</span>
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          className="p-1 rounded hover:bg-orange-600 transition-colors flex-shrink-0"
          data-testid="button-dismiss-banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <OnboardingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode="onboarding"
      />
    </>
  );
}
