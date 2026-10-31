'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { isAdminRole } from '@/lib/roles';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export default function AdminRootRedirect() {
  const router = useRouter();
  const { user, isLoading: loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user && isAdminRole(user.role)) {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/admin/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#B91C1C]/15 border border-[#B91C1C]/30 flex items-center justify-center text-[#B91C1C]">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
        <h2 className="text-base font-semibold text-white tracking-tight">
          PDFNestly Security & Administration Portal
        </h2>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#B91C1C]" />
          <span>Verifying role authorization...</span>
        </div>
      </div>
    </div>
  );
}
