import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { supabase } from "../config/supabase";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      const { data: isAdmin, error: rpcError } = await supabase.rpc("am_i_admin");
      if (rpcError) throw rpcError;

      if (!isAdmin) {
        await supabase.auth.signOut();
        setError("This account doesn't have admin access.");
        return;
      }

      navigate(location.state?.from || "/", { replace: true });
    } catch (err: any) {
      const message =
        err.message?.includes("Invalid login credentials")
          ? "Incorrect email or password."
          : err.message?.includes("rate limit")
          ? "Too many attempts. Please try again later."
          : "Could not sign in. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow p-8 w-full max-w-sm"
      >
        <h1 className="text-2xl font-bold mb-1">🌿 MedVeda Admin</h1>
        <p className="text-gray-500 mb-6">Sign in to manage content</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-green-600"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 transition"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
