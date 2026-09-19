import { Outlet } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function AdminLayout() {
  return (
    <div className="flex bg-slate-100 min-h-screen">

      <Sidebar />

      <div className="flex-1 p-8">

        <Header />

        <div className="mt-8">
          <Outlet />
        </div>

      </div>
    </div>
  );
}