import type { Metadata } from "next";
import { Assistente } from "./view";

export const metadata: Metadata = { title: "Assistente IA" };

export default function AssistentePage() {
  return <Assistente />;
}
