import { useState } from "react";
import { sendPushNotification } from "../services/notificationService";

export default function Notifications() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("announcement");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const sendNotification = async () => {
    if (!title.trim() || !message.trim()) {
      alert("Please enter notification title and message.");
      return;
    }

    try {
      setLoading(true);
      setStatus("");

      const data = await sendPushNotification({
        title,
        body: message,
        type,
      });

      setStatus(
        `✅ Notification sent successfully to ${data?.pushed ?? 0} device(s).`
      );

      setTitle("");
      setMessage("");
      setType("announcement");
    } catch (err: any) {
      console.error("Notification Error:", err);

      setStatus(
        `❌ ${err?.message || "Failed to send notification."}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl p-8">
      <h1 className="text-3xl font-bold mb-2">
        Send Notification
      </h1>

      <p className="text-gray-500 mb-8">
        Send push notifications to MedVeda users.
      </p>

      <div className="bg-white border rounded-xl shadow p-6 space-y-6">
        <div>
          <label className="block font-medium mb-2">
            Notification Title
          </label>

          <input
            type="text"
            value={title}
            placeholder="Enter notification title"
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        <div>
          <label className="block font-medium mb-2">
            Notification Message
          </label>

          <textarea
            rows={5}
            value={message}
            placeholder="Enter notification message"
            onChange={(e) => setMessage(e.target.value)}
            className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        <div>
          <label className="block font-medium mb-2">
            Notification Type
          </label>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="announcement">Announcement</option>
            <option value="new_notes">New Notes</option>
            <option value="new_video">New Video</option>
            <option value="quiz">Quiz</option>
            <option value="offer">Offer</option>
            <option value="app_update">App Update</option>
          </select>
        </div>

        <button
          onClick={sendNotification}
          disabled={loading}
          className="bg-green-700 hover:bg-green-800 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition"
        >
          {loading ? "Sending Notification..." : "Send Notification"}
        </button>

        {status && (
          <div className="rounded-lg border bg-gray-50 p-4">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}