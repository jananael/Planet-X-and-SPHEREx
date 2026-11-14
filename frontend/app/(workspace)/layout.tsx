import { Explorer } from "../../components/explorer";
import "../explore/explorer.css";
// Keep one exploration session alive across workspace route transitions.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <><Explorer />{children}</>;
}
