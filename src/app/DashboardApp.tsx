"use client";

import dynamic from "next/dynamic";

// The dashboard reads window, localStorage and the speech API, so it renders in the browser only.
const App = dynamic(() => import("../dashboard/App"), { ssr: false });

export default function DashboardApp() {
  return <App />;
}
