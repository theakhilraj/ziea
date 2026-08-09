import Link from "next/link";
import Image from "next/image";
import { FaInstagram, FaWhatsapp, FaFacebook } from "react-icons/fa6";
import NewsletterForm from "@/components/client/home/NewsletterForm";
import ProtoformCredit from "@/components/client/layout/ProtoformCredit";
import { getCategories } from "@/utils/categories";
import { WHATSAPP_ORDER_NUMBER } from "@/utils/whatsapp";

// WhatsApp "click to chat" (wa.me/<countrycode+number>) — no Business API needed.
// The ?text= param pre-fills the customer's message box so their chat opens
// ready to send, written from a dress-shopping perspective. The number is the
// single shared constant from utils/whatsapp.ts.
const WHATSAPP_MESSAGE =
  "Hi ZIEA, I came across your collection and I'd love some help. Could you tell me about availability, sizes, fabric and pricing for your dresses?";
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

// Social / contact links. Swap these hrefs for the real accounts.
const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/ziea.in/", Icon: FaInstagram },
  { label: "WhatsApp", href: WHATSAPP_HREF, Icon: FaWhatsapp },
  { label: "Facebook", href: "https://www.facebook.com/61580364240386/about/", Icon: FaFacebook },
];

export default async function Footer() {
  const categories = await getCategories();

  return (
    <footer className="bg-[#2C3829] text-white">
      <div className="px-page pt-4 pb-8 lg:pt-16 lg:pb-12">

        {/* Top */}
        <div className="flex flex-col lg:flex-row justify-between">

          {/* Left Column */}
          <div className="lg:w-[34%] flex flex-col items-start">

            {/* Logo */}
            <div className="w-full -mt-16 -mb-12 lg:-mt-24 lg:-mb-20">
              <Image
                src="/Ziea_Logo.png"
                alt="ZIEA"
                width={240}
                height={100}
                priority
                className="-ml-10 w-[170px] md:w-[200px] h-auto brightness-0 invert"
              />
            </div>

            <NewsletterForm />

          </div>

          {/* Right Column */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-10 lg:w-[60%] mt-8 lg:mt-0">

            {/* Shop */}
            <div className="space-y-4">

              <h3
                className="text-[22px] text-[#F5F0E8]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Shop
              </h3>

              <ul className="space-y-3 text-[15px] text-white/80">

                {categories && categories.length > 0 ? (
                  categories.map((category) => (
                    <li key={category.id}>
                      <Link
                        href="/collections"
                        className="transition-colors hover:text-white"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))
                ) : (
                  <li className="text-white/50">
                    No Categories
                  </li>
                )}

              </ul>

            </div>

            {/* Company */}
            <div className="space-y-4">

              <h3
                className="text-[22px] text-[#F5F0E8]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Company
              </h3>

              <ul className="space-y-3 text-[15px] text-white/80">

                <li>
                  <Link href="/about-us" className="hover:text-white transition-colors">
                    Our Story
                  </Link>
                </li>

                <li>
                  <Link href="/privacy-policy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>

                <li>
                  <Link href="/terms-and-conditions" className="hover:text-white transition-colors">
                    Terms & Services
                  </Link>
                </li>

                <li>
                  <Link
                    href="/exchange-policy" className="hover:text-white transition-colors">
                    Exchange Policy
                  </Link>
                </li>

              </ul>

            </div>

            {/* Support */}
            <div className="space-y-4">

              <h3
                className="text-[22px] text-[#F5F0E8]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Support
              </h3>

              <ul className="space-y-3 text-[15px] text-white/80">

                <li>
                  <Link href="/exchange-policy" className="hover:text-white transition-colors">
                    Shipping & Returns
                  </Link>
                </li>

                <li>
                  <Link href="/contact-us" className="hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>

              </ul>

            </div>

            {/* Connect */}
            <div className="space-y-4">

              <h3
                className="text-[22px] text-[#F5F0E8]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Connect
              </h3>

              <div className="flex gap-3">
                {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                  <Link
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80 transition-colors hover:border-white hover:bg-white hover:text-[#2C3829]"
                  >
                    <Icon className="text-[17px]" />
                  </Link>
                ))}
              </div>

            </div>

          </div>

        </div>

        {/* Bottom — desktop: copyright left / credit right; mobile: stacked, both centered */}
        <div className="mt-12 border-t border-white/10 pt-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

          <p className="text-[11px] uppercase tracking-[0.18em] text-white/60 text-center md:text-left">
            © {new Date().getFullYear()} ZIEA. All Rights Reserved.
          </p>

          <ProtoformCredit className="text-center md:text-right text-[11px] uppercase tracking-[0.18em] text-white/50" />

        </div>

      </div>
    </footer>
  );
}