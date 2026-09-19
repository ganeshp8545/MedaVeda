import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import AdminLayout from "./layouts/AdminLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Years from "./pages/Years";
import Subjects from "./pages/Subjects";
import Chapters from "./pages/Chapters";
import Users from "./pages/Users";
import Notes from "./pages/Notes";
import Videos from "./pages/Videos";
import Quiz from "./pages/Quiz";
import Notifications from "./pages/Notifications";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Products from "./pages/Products";
import Orders from "./pages/Orders";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/years" element={<Years />} />
              <Route path="/subjects" element={<Subjects />} />
              <Route path="/chapters" element={<Chapters />} />
              <Route path="/users" element={<Users />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/videos" element={<Videos />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/products" element={<Products />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
