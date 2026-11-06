import { redirect } from "next/navigation";

// Batool's original links used /explorer; the Explorer lives at /explore.
export default function ExplorerAlias() {
  redirect("/explore");
}
