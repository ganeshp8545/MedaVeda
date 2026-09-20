import type { AppUser } from "../types/user";

type Props = {
  users: AppUser[];
  onToggleBlock: (user: AppUser) => void;
};

function formatDate(createdAt: any) {
  if (!createdAt) return "-";
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function UsersTable({ users, onToggleBlock }: Props) {
  if (users.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No users found.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-green-700 text-white">
          <tr>
            <th className="p-4 text-left">Name</th>
            <th className="p-4 text-left">Email</th>
            <th className="p-4 text-left">Phone</th>
            <th className="p-4 text-left">Course / Year</th>
            <th className="p-4 text-left">Referral code</th>
            <th className="p-4 text-left">Joined</th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>

        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-gray-50">
              <td className="p-4 font-medium text-gray-800">{user.name || "-"}</td>

              <td className="p-4">{user.email || "-"}</td>

              <td className="p-4">{user.phone || "-"}</td>

              <td className="p-4 text-gray-600">
                {user.courseTitle
                  ? `${user.courseTitle}${user.yearTitle ? ` · ${user.yearTitle}` : " · year not set"}`
                  : "Not selected"}
              </td>

              <td className="p-4 font-mono text-xs text-gray-600">{user.referralCode || "-"}</td>

              <td className="p-4 text-gray-500">{formatDate(user.createdAt)}</td>

              <td className="p-4">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    user.blocked
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {user.blocked ? "Blocked" : "Active"}
                </span>
              </td>

              <td className="p-4 text-right">
                <button
                  onClick={() => onToggleBlock(user)}
                  className={`text-sm font-medium hover:underline ${
                    user.blocked ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {user.blocked ? "Unblock" : "Block"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
