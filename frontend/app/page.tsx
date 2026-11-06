import Link from "next/link";
import { Brand } from "../components/brand";

// Batoul owns the Home page. This small entry point keeps that route available until integration.
export default function Home() {
  return <main className="home-placeholder"><Brand /><p className="eyebrow">POWERED BY SPHEREx</p><h1>The sky is<br /><span>never still.</span></h1><p>Explore the infrared sky across time.</p><Link className="primary-button" href="/explore">Start exploring <span aria-hidden="true">↗</span></Link><p className="muted">The team’s Home page will be integrated here.</p></main>;
}
