import { useState, useEffect } from "react";
import { PageLayout } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download, Shield, Building, FileBadge } from "lucide-react";

interface CnasFile {
  name: string;
  size: number;
  lastModified: number;
}

const FILE_CATEGORIES: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  Cot: { label: "التصريحات الشهرية (Cotisation)", icon: FileBadge, color: "text-blue-600 bg-blue-50" },
  IM: { label: "إقرارات الأجور (IM)", icon: Shield, color: "text-emerald-600 bg-emerald-50" },
  SECU: { label: "الضمان الاجتماعي (Sécurité Sociale)", icon: Building, color: "text-purple-600 bg-purple-50" },
};

function getCategory(filename: string): { label: string; icon: typeof FileText; color: string } | null {
  for (const [prefix, category] of Object.entries(FILE_CATEGORIES)) {
    if (filename.startsWith(prefix)) return category;
  }
  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FilesPage() {
  const [files, setFiles] = useState<CnasFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/files")
      .then((r) => { if (!r.ok) throw new Error("فشل تحميل الملفات"); return r.json(); })
      .then((data) => { setFiles(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const categorized = files.reduce<Record<string, CnasFile[]>>((acc, file) => {
    const cat = getCategory(file.name)?.label ?? "أخرى";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(file);
    return acc;
  }, {});

  return (
    <PageLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">الملفات</h1>
            <p className="text-sm text-slate-500">مستندات الضمان الاجتماعي (CNAS)</p>
          </div>
        </div>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-32 bg-slate-100 rounded-2xl" />
            ))}
          </div>
        )}

        {error && (
          <Card>
            <CardContent className="p-6 text-center text-red-500">{error}</CardContent>
          </Card>
        )}

        {!loading && !error && Object.entries(categorized).map(([category, catFiles]) => {
          const catInfo = Object.values(FILE_CATEGORIES).find((c) => c.label === category)
            ?? { icon: FileText, label: category, color: "text-slate-600 bg-slate-50" };

          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-2 rounded-xl ${catInfo.color}`}>
                  <catInfo.icon className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-700">{category}</h2>
              </div>
              <div className="grid gap-3">
                {catFiles.map((file) => (
                  <a
                    key={file.name}
                    href={`/api/files/serve/${encodeURIComponent(file.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-8 h-8 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{file.name}</p>
                            <p className="text-xs text-slate-400">
                              {formatSize(file.size)} — {formatDate(file.lastModified)}
                            </p>
                          </div>
                        </div>
                        <Download className="w-5 h-5 text-primary flex-shrink-0" />
                      </CardContent>
                    </Card>
                  </a>
                ))}
              </div>
            </div>
          );
        })}

        {!loading && !error && files.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-slate-500">لا توجد ملفات حالياً</CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
