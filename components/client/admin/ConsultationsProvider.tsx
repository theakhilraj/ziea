"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/utils/supabase/client";

type ConsultationsContextValue = {
  /** Count of confirmed (upcoming/active) bookings — drives the sidebar badge. */
  newCount: number;
  refresh: () => void;
};

const ConsultationsContext = createContext<ConsultationsContextValue | null>(null);

export function useConsultations() {
  const ctx = useContext(ConsultationsContext);
  if (!ctx) {
    throw new Error("useConsultations must be used within a ConsultationsProvider");
  }
  return ctx;
}

export default function ConsultationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [newCount, setNewCount] = useState(0);

  const refresh = useCallback(async () => {
    const { count } = await supabase
      .from("consultations")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed");
    setNewCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const { count } = await supabase
        .from("consultations")
        .select("*", { count: "exact", head: true })
        .eq("status", "confirmed");
      if (isMounted) setNewCount(count ?? 0);
    };

    run();

    // Live-update the badge: a new booking (INSERT) bumps it, and a status
    // change (UPDATE, e.g. completed/cancelled) recounts. Same realtime pattern
    // as the orders / enquiries channels. Never crashes if realtime is down —
    // the initial run() already seeded the count.
    const channel = supabase
      .channel("admin-consultations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consultations" },
        () => {
          run();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const value = useMemo<ConsultationsContextValue>(
    () => ({ newCount, refresh }),
    [newCount, refresh]
  );

  return (
    <ConsultationsContext.Provider value={value}>
      {children}
    </ConsultationsContext.Provider>
  );
}
