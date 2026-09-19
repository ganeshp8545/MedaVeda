import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, signOut } = useAuth();

  return (
    <div className="bg-white rounded-xl shadow p-5 flex justify-between items-center">
      <div>
        <h2 className="text-2xl font-bold">
          Dashboard
        </h2>

        <p className="text-gray-500">
          Welcome back Admin 👋
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-semibold">
            Admin
          </p>

          <p className="text-sm text-gray-500">
            {user?.email}
          </p>
        </div>

        <button
          onClick={signOut}
          className="text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5 transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
