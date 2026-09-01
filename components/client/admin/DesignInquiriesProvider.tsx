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

type DesignInquiriesContextValue = {
  /** Count of new (untriaged) inquiries — drives the sidebar badge. */
  newCount: number;
  refresh: () => void;
};

const DesignInquiriesContext = createContext<DesignInquiriesContextValue | null>(
  null,
);

export function useDesignInquiries() {
  const ctx = useContext(DesignInquiriesContext);
  if (!ctx) {
    throw new Error(
      "useDesignInquiries must be used within a DesignInquiriesProvider",
    );
  }
  return ctx;
}

export default function DesignInquiriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [newCount, setNewCount] = useState(0);

  const refresh = useCallback(async () => {
    const { count } = await supabase
      .from("design_inquiries")
      .select("*", { count: "exact", head: true })
      .eq("status", "new");
    setNewCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const { count } = await supabase
        .from("design_inquiries")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");
      if (isMounted) setNewCount(count ?? 0);
    };

    run();

    // Live-update the badge: a new inquiry (INSERT) bumps it, and a status change
    // (UPDATE) recounts. A DISTINCT channel name from the consultations one so the
    // two subscriptions don't collide. Never crashes if realtime is down — the
    // initial run() already seeded the count.
    const channel = supabase
      .channel("admin-design-inquiries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "design_inquiries" },
        () => {
          run();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const value = useMemo<DesignInquiriesContextValue>(
    () => ({ newCount, refresh }),
    [newCount, refresh],
  );

  return (
    <DesignInquiriesContext.Provider value={value}>
      {children}
    </DesignInquiriesContext.Provider>
  );
}
