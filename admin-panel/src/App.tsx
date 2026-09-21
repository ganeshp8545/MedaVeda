import { lazy } from "react";
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
const Years = lazy(() => import("./pages/Years"));
const Subjects = lazy(() => import("./pages/Subjects"));
const Chapters = lazy(() => import("./pages/Chapters"));
const Users = lazy(() => import("./pages/Users"));
const Notes = lazy(() => import("./pages/Notes"));
const Videos = lazy(() => import("./pages/Videos"));
const Quiz = lazy(() => import("./pages/Quiz"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Products = lazy(() => import("./pages/Products"));
const Orders = lazy(() => import("./pages/Orders"));
const Courses = lazy(() => import("./pages/Courses"));
const Referrals = lazy(() => import("./pages/Referrals"));
const ReviewFlags = lazy(() => import("./pages/ReviewFlags"));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/years" element={<Years />} />
              <Route path="/subjects" element={<Subjects />} />
              <Route path="/chapters" element={<Chapters />} />
              <Route path="/users" element={<Users />} />
              <Route path="/referrals" element={<Referrals />} />
              <Route path="/review-flags" element={<ReviewFlags />} />
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
