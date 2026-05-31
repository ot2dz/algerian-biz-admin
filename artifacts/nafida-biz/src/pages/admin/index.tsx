import { useState, useEffect } from "react";
import { PageLayout } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Users, Files, Upload, Pencil, Trash2, X, Check, Download } from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface GlobalFile {
  name: string;
  size: number;
  lastModified: number;
}

type ActiveTab = "users" | "files";

function getAdminToken(): string | null {
  return localStorage.getItem("admin_token");
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("users");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [globalFiles, setGlobalFiles] = useState<GlobalFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchUsers = async () => {
    const token = getAdminToken();
    if (!token) { setError("غير مصرح"); setLoading(false); return; }
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("فشل تحميل المستخدمين");
      setUsers(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  const fetchGlobalFiles = async () => {
    const token = getAdminToken();
    if (!token) return;
    setFilesLoading(true);
    try {
      const res = await fetch("/api/admin/global-files", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setGlobalFiles(await res.json());
    } catch {
      /* ignore */
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (activeTab === "files") fetchGlobalFiles();
  }, [activeTab]);

  const toggleStatus = async (userId: string, current: boolean) => {
    const token = getAdminToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !current }),
      });
      if (!res.ok) throw new Error("فشل تغيير الحالة");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: !current } : u)));
    } catch {
      setError("فشل تغيير حالة المستخدم");
    }
  };

  const uploadGlobalFile = async () => {
    const input = document.getElementById("global-file-upload") as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    setUploading(true);
    const token = getAdminToken();
    if (!token) { setUploading(false); return; }

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/admin/global-files", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error("فشل رفع الملف");
      input.value = "";
      await fetchGlobalFiles();
    } catch {
      setError("فشل رفع الملف");
    } finally {
      setUploading(false);
    }
  };

  const deleteGlobalFile = async (name: string) => {
    const token = getAdminToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/global-files/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("فشل حذف الملف");
      setGlobalFiles((prev) => prev.filter((f) => f.name !== name));
    } catch {
      setError("فشل حذف الملف");
    }
  };

  const startRename = (file: GlobalFile) => {
    setRenaming(file.name);
    setRenameValue(file.name);
  };

  const submitRename = async (oldName: string) => {
    if (!renameValue.trim()) { setRenaming(null); return; }
    const token = getAdminToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/global-files/${encodeURIComponent(oldName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error("فشل إعادة التسمية");
      await fetchGlobalFiles();
    } catch {
      setError("فشل إعادة التسمية");
    } finally {
      setRenaming(null);
    }
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      u.company_name?.toLowerCase().includes(q)
    );
  });

  const tabs = [
    { key: "users" as ActiveTab, label: "المستخدمون", icon: Users },
    { key: "files" as ActiveTab, label: "إدارة الملفات العامة", icon: Files },
  ];

  return (
    <PageLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم</h1>
            <p className="text-sm text-slate-500">إدارة المستخدمين والملفات العامة</p>
          </div>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "users" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  المستخدمين
                </CardTitle>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="بحث..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-3 pl-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse h-12 bg-slate-100 rounded-lg" />
                  ))}
                </div>
              )}

              {error && !loading && (
                <div className="text-center text-red-500 py-8">{error}</div>
              )}

              {!loading && !error && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المستخدم</TableHead>
                      <TableHead className="text-right">البريد الإلكتروني</TableHead>
                      <TableHead className="text-right">الشركة</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-right">تاريخ التسجيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                          {search ? "لا توجد نتائج" : "لا يوجد مستخدمين"}
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.full_name || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—"}
                        </TableCell>
                        <TableCell className="text-slate-500">{u.email}</TableCell>
                        <TableCell className="text-slate-500">{u.company_name || "—"}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={u.is_active}
                              onCheckedChange={() => toggleStatus(u.id, u.is_active)}
                            />
                            <Badge variant={u.is_active ? "default" : "secondary"}>
                              {u.is_active ? "نشط" : "موقوف"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {new Date(u.created_at).toLocaleDateString("ar-DZ", {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "files" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Files className="w-5 h-5 text-primary" />
                إدارة الملفات العامة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="text-center text-red-500 bg-red-50 py-3 px-4 rounded-xl text-sm">{error}</div>
              )}
              <div className="flex items-end gap-3 p-4 bg-slate-50 rounded-xl">
                <div className="flex-1">
                  <label className="text-sm font-medium text-slate-600 mb-1 block">
                    رفع ملف جديد
                  </label>
                  <Input id="global-file-upload" type="file" className="bg-white" />
                </div>
                <Button
                  onClick={uploadGlobalFile}
                  disabled={uploading}
                  className="flex items-center gap-1"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? "جاري الرفع..." : "رفع"}
                </Button>
              </div>

              {filesLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse h-14 bg-slate-100 rounded-lg" />
                  ))}
                </div>
              )}

              {!filesLoading && globalFiles.length === 0 && (
                <div className="text-center text-slate-500 py-8">
                  لا توجد ملفات عامة حالياً
                </div>
              )}

              {!filesLoading && globalFiles.length > 0 && (
                <div className="space-y-2">
                  {globalFiles.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between p-3 bg-white border rounded-lg hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Files className="w-8 h-8 text-slate-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          {renaming === f.name ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="h-8 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitRename(f.name);
                                  if (e.key === "Escape") setRenaming(null);
                                }}
                              />
                              <Button size="icon" variant="ghost" onClick={() => submitRename(f.name)}>
                                <Check className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setRenaming(null)}>
                                <X className="w-4 h-4 text-slate-400" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="font-medium text-slate-800 truncate text-sm">
                                {f.name}
                              </p>
                              <p className="text-xs text-slate-400">{formatSize(f.size)}</p>
                            </>
                          )}
                        </div>
                      </div>
                      {renaming !== f.name && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <a
                            href={`/api/admin/global-files/serve/${encodeURIComponent(f.name)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="icon" variant="ghost" title="تحميل">
                              <Download className="w-4 h-4 text-blue-500" />
                            </Button>
                          </a>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startRename(f)}
                            title="إعادة تسمية"
                          >
                            <Pencil className="w-4 h-4 text-slate-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteGlobalFile(f.name)}
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
