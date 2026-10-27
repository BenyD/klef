// The search index, exported once at build time and searched in the browser.
import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

const server = createFromSource(source, { language: "english" });

export async function loader() {
  return server.staticGET();
}
