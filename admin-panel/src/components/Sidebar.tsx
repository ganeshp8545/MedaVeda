import { NavLink } from "react-router-dom";

const menus = [
  { name: "Dashboard", path: "/" },
  { name: "Courses", path: "/courses" },
  { name: "Academic Years", path: "/years" },
  { name: "Subjects", path: "/subjects" },
  { name: "Chapters", path: "/chapters" },
  { name: "Products", path: "/products" },
  { name: "Notes", path: "/notes" },
  { name: "Videos", path: "/videos" },
  { name: "Quiz", path: "/quiz" },
  { name: "Orders", path: "/orders" },
  { name: "Users", path: "/users" },
  { name: "Referrals", path: "/referrals" },
  { name: "Review Flags", path: "/review-flags" },
  { name: "Notifications", path: "/notifications" },
  { name: "Analytics", path: "/analytics" },
  { name: "Settings", path: "/settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-green-700 text-white min-h-screen p-6">
      <h1 className="text-3xl font-bold">
        MedVeda
      </h1>

      <p className="text-green-100 mb-10">
        Admin Panel
      </p>

      <nav className="space-y-2">
        {menus.map((menu) => (
          <NavLink
            key={menu.path}
            to={menu.path}
            end={menu.path === "/"}
            className={({ isActive }) =>
              `block rounded-lg px-4 py-3 transition ${
                isActive
                  ? "bg-white text-green-700 font-semibold"
                  : "hover:bg-green-600"
              }`
            }
          >
            {menu.name}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
