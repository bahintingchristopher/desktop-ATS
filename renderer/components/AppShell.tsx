"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { call, useIsElectron } from "@/lib/ats";
import Sidebar from "./Sidebar";
import { cx } from "./ui";

type AuthStatus = { hasAccount: boolean; authenticated: boolean; email: string | null };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const electron = useIsElectron();
  const [ready, setReady] = useState(false);
  const isLogin = path === "/login/";

  useEffect(() => {
    if (electron === null) return;
    if (!electron) {
      setReady(true);
      return;
    }
    let active = true;
    call<AuthStatus>("auth:status")
      .then((s) => {
        if (!active) return;
        if (!s.authenticated && !isLogin) router.replace("/login/");
        else if (s.authenticated && isLogin) router.replace("/analytics/");
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => { active = false; };
  }, [electron, isLogin, router]);

  if (electron === true && !ready && !isLogin) return <div className="h-screen bg-bg" />;

  return (
    <div className="flex h-screen overflow-hidden">
      {!isLogin && <Sidebar />}
      <main className={cx("min-w-0 flex-1", isLogin ? "" : "overflow-auto p-5")}>{children}</main>
    </div>
  );
}
