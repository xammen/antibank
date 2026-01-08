"use client";

import { useEffect } from "react";

export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reset scroll on every navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return <>{children}</>;
}
