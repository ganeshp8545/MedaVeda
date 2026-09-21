import { supabase } from "../config/supabase";

// A video's URL is never listed. The get-video-url Edge Function checks the
// caller's entitlement (free preview, or a purchase covering the subject/year/
// bundle) and returns the URL only then. Call it right before opening the video
// and do not cache the result.
export async function getSecureVideoUrl(videoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("get-video-url", {
    body: { videoId },
  });

  if (error || !data?.url) {
    throw new Error(
      "This video isn't available to you right now. If you believe this is a mistake, please contact support."
    );
  }

  return data.url as string;
}
