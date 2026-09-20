"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MdClose, MdOutlineTune } from "react-icons/md";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

const SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL"];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "popular", label: "Popularity" },
];

interface FiltersPanelProps {
  categories: { id: string; name: string }[];
  facets: {
    badges: string[];
    materials: string[];
    minPrice: number;
    maxPrice: number;
  };
}

/** Parse a CSV URL param into a trimmed, non-empty string array. */
function parseCsv(value: string | null): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function FiltersPanel({
  categories,
  facets,
}: FiltersPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock page scroll while filter drawer is open.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // --------------------------------------------------
  // Draft state
  // --------------------------------------------------

  const [category, setCategory] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [sort, setSort] = useState("newest");

  // --------------------------------------------------
  // Price slider state
  // --------------------------------------------------

  const [sliderMin, setSliderMin] = useState(facets.minPrice);
  const [sliderMax, setSliderMax] = useState(facets.maxPrice);

  /*
   * Keep slider values in sync if the catalog's price
   * boundaries change.
   */
  useEffect(() => {
    setSliderMin(facets.minPrice);
    setSliderMax(facets.maxPrice);
  }, [facets.minPrice, facets.maxPrice]);

  // --------------------------------------------------
  // Active filter count
  // --------------------------------------------------

  const activeCount = useMemo(() => {
    let n = 0;

    if (searchParams.get("category")) n++;
    if (searchParams.get("minPrice")) n++;
    if (searchParams.get("maxPrice")) n++;

    n += parseCsv(searchParams.get("sizes")).length;
    n += parseCsv(searchParams.get("badges")).length;

    return n;
  }, [searchParams]);

  // --------------------------------------------------
  // Initialise draft state whenever drawer opens
  // --------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    const urlMin = searchParams.get("minPrice");
    const urlMax = searchParams.get("maxPrice");

    setCategory(searchParams.get("category") ?? "");
    setMinPrice(urlMin ?? "");
    setMaxPrice(urlMax ?? "");
    setSizes(parseCsv(searchParams.get("sizes")));
    setBadges(parseCsv(searchParams.get("badges")));
    setSort(searchParams.get("sort") || "newest");

    // If no price filter is present, show the complete catalog range.
    setSliderMin(
      urlMin
        ? Math.max(
          facets.minPrice,
          Math.min(Number(urlMin), facets.maxPrice)
        )
        : facets.minPrice
    );

    setSliderMax(
      urlMax
        ? Math.min(
          facets.maxPrice,
          Math.max(Number(urlMax), facets.minPrice)
        )
        : facets.maxPrice
    );
  }, [
    isOpen,
    searchParams,
    facets.minPrice,
    facets.maxPrice,
  ]);

  // --------------------------------------------------
  // Toggle helper
  // --------------------------------------------------

  const toggle = (arr: string[], value: string) =>
    arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];

  // --------------------------------------------------
  // Price helpers
  // --------------------------------------------------

  const clampPrice = (raw: string): string => {
    const t = raw.trim();

    if (t === "" || Number.isNaN(Number(t))) {
      return "";
    }

    const n = Math.round(Number(t));

    const clamped = Math.min(
      Math.max(n, facets.minPrice),
      facets.maxPrice
    );

    return String(clamped);
  };

  // --------------------------------------------------
  // Slider handlers
  // --------------------------------------------------

  const handleSliderMinChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(e.target.value);

    // Don't allow minimum to cross maximum.
    const newMin = Math.min(value, sliderMax);

    setSliderMin(newMin);
    setMinPrice(String(newMin));
  };

  const handleSliderMaxChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(e.target.value);

    // Don't allow maximum to go below minimum.
    const newMax = Math.max(value, sliderMin);

    setSliderMax(newMax);
    setMaxPrice(String(newMax));
  };

  // --------------------------------------------------
  // Typed input handlers
  // --------------------------------------------------

  const handleMinChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;

    setMinPrice(value);

    if (value === "") {
      setSliderMin(facets.minPrice);
      return;
    }

    const numberValue = Number(value);

    if (!Number.isNaN(numberValue)) {
      const clamped = Math.min(
        Math.max(numberValue, facets.minPrice),
        sliderMax
      );

      setSliderMin(clamped);
    }
  };

  const handleMaxChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;

    setMaxPrice(value);

    if (value === "") {
      setSliderMax(facets.maxPrice);
      return;
    }

    const numberValue = Number(value);

    if (!Number.isNaN(numberValue)) {
      const clamped = Math.max(
        Math.min(numberValue, facets.maxPrice),
        sliderMin
      );

      setSliderMax(clamped);
    }
  };

  // --------------------------------------------------
  // Blur handlers
  // --------------------------------------------------

  const handleMinBlur = () => {
    let value = clampPrice(minPrice);

    if (
      value &&
      maxPrice.trim() &&
      !Number.isNaN(Number(maxPrice)) &&
      Number(value) > Number(maxPrice)
    ) {
      value = clampPrice(maxPrice);
    }

    setMinPrice(value);

    if (value) {
      setSliderMin(Number(value));
    } else {
      setSliderMin(facets.minPrice);
    }
  };

  const handleMaxBlur = () => {
    let value = clampPrice(maxPrice);

    if (
      value &&
      minPrice.trim() &&
      !Number.isNaN(Number(minPrice)) &&
      Number(value) < Number(minPrice)
    ) {
      value = clampPrice(minPrice);
    }

    setMaxPrice(value);

    if (value) {
      setSliderMax(Number(value));
    } else {
      setSliderMax(facets.maxPrice);
    }
  };

  // --------------------------------------------------
  // URL handling
  // --------------------------------------------------

  const pushParams = (
    mutate: (params: URLSearchParams) => void
  ) => {
    const params = new URLSearchParams();

    // Preserve search term only.
    const q = searchParams.get("q");

    if (q) {
      params.set("q", q);
    }

    mutate(params);

    // Always reset paging on filter/sort change.
    params.delete("page");

    const query = params.toString();

    router.push(
      query
        ? `/collections?${query}`
        : "/collections"
    );
  };

  // --------------------------------------------------
  // Apply
  // --------------------------------------------------

  const handleApply = () => {
    let min = clampPrice(minPrice);
    let max = clampPrice(maxPrice);

    // If both values exist, make sure min <= max.
    if (
      min &&
      max &&
      Number(min) > Number(max)
    ) {
      [min, max] = [max, min];
    }

    // Reflect corrected values back into state.
    setMinPrice(min);
    setMaxPrice(max);

    setSliderMin(
      min
        ? Number(min)
        : facets.minPrice
    );

    setSliderMax(
      max
        ? Number(max)
        : facets.maxPrice
    );

    pushParams((params) => {
      if (category) {
        params.set("category", category);
      }

      if (min) {
        params.set("minPrice", min);
      }

      if (max) {
        params.set("maxPrice", max);
      }

      if (sizes.length) {
        params.set("sizes", sizes.join(","));
      }

      if (badges.length) {
        params.set("badges", badges.join(","));
      }

      if (sort && sort !== "newest") {
        params.set("sort", sort);
      }
    });

    setIsOpen(false);
  };

  // --------------------------------------------------
  // Clear all
  // --------------------------------------------------

  const handleClearAll = () => {
    pushParams(() => { });

    setCategory("");
    setMinPrice("");
    setMaxPrice("");
    setSizes([]);
    setBadges([]);
    setSort("newest");

    setSliderMin(facets.minPrice);
    setSliderMax(facets.maxPrice);

    setIsOpen(false);
  };

  // --------------------------------------------------
  // Styles
  // --------------------------------------------------

  const chipClass = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-95 ${active
      ? "bg-[#4c623d] text-white"
      : "bg-[#eee0d6]/50 text-[#44483f] hover:bg-[#eee0d6]"
    }`;

  const sectionTitle =
    "font-cormorant text-2xl text-[#2C3829] mb-3";

  // --------------------------------------------------
  // Price slider percentages
  // --------------------------------------------------

  const priceRange =
    facets.maxPrice - facets.minPrice;

  const minPercent =
    priceRange > 0
      ? ((sliderMin - facets.minPrice) / priceRange) * 100
      : 0;

  const maxPercent =
    priceRange > 0
      ? ((sliderMax - facets.minPrice) / priceRange) * 100
      : 100;

  return (
    <>
      {/* ------------------------------------------------
          Filter trigger
          ------------------------------------------------ */}

      <div className="flex justify-center md:justify-end">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="
            flex
            w-full
            justify-center
            md:w-auto
            md:justify-start
            items-center
            gap-2
            rounded-full
            border
            border-[#d6c3b3]
            bg-white
            px-5
            py-2.5
            font-jost
            text-sm
            font-medium
            text-[#2C3829]
            transition-all
            hover:border-primary/50
            active:scale-95
            shadow-sm
          "
        >
          <MdOutlineTune className="text-lg" />

          Filters

          {activeCount > 0 && (
            <span
              className="
                ml-1
                flex
                h-5
                min-w-[1.25rem]
                items-center
                justify-center
                rounded-full
                bg-[#4c623d]
                px-1.5
                text-[11px]
                font-semibold
                text-white
              "
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* ------------------------------------------------
          Filter drawer
          ------------------------------------------------ */}

      {isOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex justify-end">
            {/* Backdrop */}
            <div
              className="
                absolute
                inset-0
                bg-[#2C3829]/20
                backdrop-blur-sm
                transition-opacity
              "
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <div
              className="
                relative
                w-full
                md:w-[450px]
                bg-[#FAF7F2]
                h-full
                shadow-2xl
                flex
                flex-col
                animate-in
                slide-in-from-right
                duration-300
              "
            >
              {/* Header */}
              <div
                className="
                  flex
                  items-center
                  justify-between
                  p-6
                  border-b
                  border-[#d6c3b3]/30
                  bg-[#FAF7F2]
                  shrink-0
                "
              >
                <h2
                  className="
                    font-cormorant
                    text-3xl
                    text-[#2C3829]
                    font-bold
                  "
                >
                  Filters
                </h2>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="
                    text-[#2C3829]/70
                    hover:text-[#2C3829]
                    transition-colors
                    p-2
                    rounded-full
                    hover:bg-black/5
                  "
                  aria-label="Close filters"
                >
                  <MdClose className="text-xl" />
                </button>
              </div>

              {/* Body */}
              <div
                className="
                  flex-1
                  overflow-y-auto
                  p-6
                  space-y-8
                "
              >
                {/* ------------------------------------------------
                    Sort
                    ------------------------------------------------ */}

                <div>
                  <h3 className={sectionTitle}>
                    Sort by
                  </h3>

                  <Select
                    label=""
                    value={sort}
                    onChange={setSort}
                    options={SORT_OPTIONS}
                    placeholder="Sort by"
                  />
                </div>

                {/* ------------------------------------------------
                    Category
                    ------------------------------------------------ */}

                <div>
                  <h3 className={sectionTitle}>
                    Category
                  </h3>

                  <div className="space-y-2">
                    <label
                      className="
                        flex
                        items-center
                        gap-3
                        cursor-pointer
                        font-jost
                        text-sm
                        text-[#44483f]
                      "
                    >
                      <input
                        type="radio"
                        name="category"
                        checked={category === ""}
                        onChange={() => setCategory("")}
                        className="accent-[#4c623d] w-4 h-4"
                      />

                      All
                    </label>

                    {categories.map((c) => (
                      <label
                        key={c.id}
                        className="
                          flex
                          items-center
                          gap-3
                          cursor-pointer
                          font-jost
                          text-sm
                          text-[#44483f]
                        "
                      >
                        <input
                          type="radio"
                          name="category"
                          checked={category === c.id}
                          onChange={() =>
                            setCategory(c.id)
                          }
                          className="
                            accent-[#4c623d]
                            w-4
                            h-4
                          "
                        />

                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>

                {/* ------------------------------------------------
                    PRICE RANGE — AMAZON STYLE
                    ------------------------------------------------ */}

                <div>
                  <h3 className={sectionTitle}>
                    Price range
                  </h3>

                  {/* Current selected range */}
                  <div className="flex justify-between mb-5">
                    <span className="font-jost text-xs text-[#777]">
                      ₹{sliderMin.toLocaleString("en-IN")}
                    </span>

                    <span className="font-jost text-xs text-[#777]">
                      ₹{sliderMax.toLocaleString("en-IN")}
                    </span>
                  </div>

                  {/* Dual range slider */}
                  <div className="relative h-6 mb-5">
                    {/* Background track */}
                    <div
                      className="
                        absolute
                        top-1/2
                        left-0
                        right-0
                        h-1.5
                        -translate-y-1/2
                        rounded-full
                        bg-[#ddd5cc]
                      "
                    />

                    {/* Selected range */}
                    <div
                      className="
                        absolute
                        top-1/2
                        h-1.5
                        -translate-y-1/2
                        rounded-full
                        bg-[#4c623d]
                      "
                      style={{
                        left: `${minPercent}%`,
                        right: `${100 - maxPercent}%`,
                      }}
                    />

                    {/* Minimum handle */}
                    <input
                      type="range"
                      min={facets.minPrice}
                      max={facets.maxPrice}
                      step={1}
                      value={sliderMin}
                      onChange={handleSliderMinChange}
                      aria-label="Minimum price"
                      className="
                        absolute
                        inset-0
                        w-full
                        h-6
                        appearance-none
                        bg-transparent
                        pointer-events-none
                        z-30

                        [&::-webkit-slider-runnable-track]:appearance-none
                        [&::-webkit-slider-runnable-track]:bg-transparent
                        [&::-webkit-slider-runnable-track]:h-1.5

                        [&::-moz-range-track]:bg-transparent
                        [&::-moz-range-track]:h-1.5

                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:pointer-events-auto
                        [&::-webkit-slider-thumb]:w-5
                        [&::-webkit-slider-thumb]:h-5
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-[#4c623d]
                        [&::-webkit-slider-thumb]:border-2
                        [&::-webkit-slider-thumb]:border-white
                        [&::-webkit-slider-thumb]:shadow-md
                        [&::-webkit-slider-thumb]:cursor-pointer

                        [&::-moz-range-thumb]:pointer-events-auto
                        [&::-moz-range-thumb]:w-5
                        [&::-moz-range-thumb]:h-5
                        [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-[#4c623d]
                        [&::-moz-range-thumb]:border-2
                        [&::-moz-range-thumb]:border-white
                        [&::-moz-range-thumb]:shadow-md
                        [&::-moz-range-thumb]:cursor-pointer
                      "
                    />

                    {/* Maximum handle */}
                    <input
                      type="range"
                      min={facets.minPrice}
                      max={facets.maxPrice}
                      step={1}
                      value={sliderMax}
                      onChange={handleSliderMaxChange}
                      aria-label="Maximum price"
                      className="
                        absolute
                        inset-0
                        w-full
                        h-6
                        appearance-none
                        bg-transparent
                        pointer-events-none
                        z-20

                        [&::-webkit-slider-runnable-track]:appearance-none
                        [&::-webkit-slider-runnable-track]:bg-transparent
                        [&::-webkit-slider-runnable-track]:h-1.5

                        [&::-moz-range-track]:bg-transparent
                        [&::-moz-range-track]:h-1.5

                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:pointer-events-auto
                        [&::-webkit-slider-thumb]:w-5
                        [&::-webkit-slider-thumb]:h-5
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-[#4c623d]
                        [&::-webkit-slider-thumb]:border-2
                        [&::-webkit-slider-thumb]:border-white
                        [&::-webkit-slider-thumb]:shadow-md
                        [&::-webkit-slider-thumb]:cursor-pointer

                        [&::-moz-range-thumb]:pointer-events-auto
                        [&::-moz-range-thumb]:w-5
                        [&::-moz-range-thumb]:h-5
                        [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-[#4c623d]
                        [&::-moz-range-thumb]:border-2
                        [&::-moz-range-thumb]:border-white
                        [&::-moz-range-thumb]:shadow-md
                        [&::-moz-range-thumb]:cursor-pointer
                      "
                    />
                  </div>

                  {/* Min / Max input boxes */}
                  <div className="flex items-center gap-3">
                    <div className="relative w-full">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#777] text-sm">
                        ₹
                      </span>

                      <input
                        type="number"
                        inputMode="numeric"
                        min={facets.minPrice}
                        max={facets.maxPrice}
                        value={minPrice}
                        onChange={handleMinChange}
                        onBlur={handleMinBlur}
                        placeholder={`${facets.minPrice}`}
                        aria-label="Minimum price"
                        className="
                          w-full
                          pl-8
                          pr-4
                          py-2.5
                          border
                          border-[#d6c3b3]
                          rounded-xl
                          bg-white
                          font-jost
                          text-sm
                          text-[#2C3829]
                          outline-none
                          focus:border-primary
                          focus:ring-4
                          focus:ring-primary/5
                          transition-all
                          [appearance:textfield]
                          [&::-webkit-outer-spin-button]:appearance-none
                          [&::-webkit-inner-spin-button]:appearance-none
                        "
                      />
                    </div>

                    <span className="text-[#44483f]">
                      &ndash;
                    </span>

                    <div className="relative w-full">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#777] text-sm">
                        ₹
                      </span>

                      <input
                        type="number"
                        inputMode="numeric"
                        min={facets.minPrice}
                        max={facets.maxPrice}
                        value={maxPrice}
                        onChange={handleMaxChange}
                        onBlur={handleMaxBlur}
                        placeholder={`${facets.maxPrice}`}
                        aria-label="Maximum price"
                        className="
                          w-full
                          pl-8
                          pr-4
                          py-2.5
                          border
                          border-[#d6c3b3]
                          rounded-xl
                          bg-white
                          font-jost
                          text-sm
                          text-[#2C3829]
                          outline-none
                          focus:border-primary
                          focus:ring-4
                          focus:ring-primary/5
                          transition-all
                          [appearance:textfield]
                          [&::-webkit-outer-spin-button]:appearance-none
                          [&::-webkit-inner-spin-button]:appearance-none
                        "
                      />
                    </div>
                  </div>
                </div>

                {/* ------------------------------------------------
                    Size
                    ------------------------------------------------ */}

                <div>
                  <h3 className={sectionTitle}>
                    Size
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    {SIZE_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setSizes((prev) =>
                            toggle(prev, s)
                          )
                        }
                        className={chipClass(
                          sizes.includes(s)
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ------------------------------------------------
                    Badge
                    ------------------------------------------------ */}

                {facets.badges.length > 0 && (
                  <div>
                    <h3 className={sectionTitle}>
                      Badge
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      {facets.badges.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() =>
                            setBadges((prev) =>
                              toggle(prev, b)
                            )
                          }
                          className={chipClass(
                            badges.includes(b)
                          )}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ------------------------------------------------
                  Footer
                  ------------------------------------------------ */}

              <div
                className="
                  p-6
                  border-t
                  border-[#d6c3b3]/30
                  bg-[#FAF7F2]
                  flex
                  gap-3
                  shrink-0
                "
              >
                <Button
                  type="button"
                  variant="auth-social"
                  className="
                    !w-auto
                    flex-1
                    !py-3
                    text-sm
                    !rounded-full
                  "
                  onClick={handleClearAll}
                >
                  Clear all
                </Button>

                <Button
                  type="button"
                  variant="auth-primary"
                  className="
                    !w-auto
                    flex-1
                    !py-3
                    text-sm
                    !rounded-full
                  "
                  onClick={handleApply}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}