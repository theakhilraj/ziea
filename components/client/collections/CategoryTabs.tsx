"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

interface Category {
  id: string;
  name: string;
}

export default function CategoryTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching categories:", error);
      } else {
        setCategories(data ?? []);
      }
    };

    fetchCategories();
  }, []);

  const tabClass = (isActive: boolean) =>
    `px-4 py-1.5 md:px-6 md:py-2.5 rounded-full whitespace-nowrap text-[13px] md:text-sm font-medium transition-all active:scale-95 shadow-sm ${isActive
      ? "bg-[#4c623d] text-white"
      : "bg-[#eee0d6]/50 text-[#44483f] hover:bg-[#eee0d6]"
    }`;

  return (
    <div className="flex overflow-x-auto hide-scrollbar gap-3 pt-2 pb-3 md:justify-center md:pr-28">
      <button
        onClick={() => router.push("/collections")}
        className={tabClass(!activeCategory)}
      >
        All
      </button>

      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() =>
            router.push(`/collections?category=${category.id}`)
          }
          className={tabClass(activeCategory === category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
