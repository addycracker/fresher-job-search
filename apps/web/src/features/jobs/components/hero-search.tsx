"use client";
import { Search, MapPin, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PAGE_ROUTES } from "@/constants/routes";
import { UI } from "@/constants/content";

export function HeroSearch({ locations }: { locations: string[] }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    if (location) params.set("location", location);
    router.push(`${PAGE_ROUTES.JOBS}?${params}`);
  }
  return (
    <form className="hero-search" onSubmit={submit} role="search">
      <label className="search-keyword">
        <Search size={20} aria-hidden="true" />
        <span className="sr-only">Search opportunities</span>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          maxLength={100}
          placeholder={UI.SEARCH_PLACEHOLDER}
        />
      </label>
      <label className="search-location">
        <MapPin size={19} aria-hidden="true" />
        <span className="sr-only">Preferred location</span>
        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        >
          <option value="">Anywhere</option>
          {locations.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="button button-primary">
        Find my next step <ArrowRight size={17} />
      </button>
    </form>
  );
}
