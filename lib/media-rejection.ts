export const MEDIA_REJECTION_PROMPTS = [
  { id: "delivery_or_message", label: "Delivery or message", message: "The delivery was hard to follow, or the main message didn’t come through." },
  { id: "video_quality", label: "Video quality", message: "The lighting, framing, camera or background needs work." },
  { id: "too_similar_to_past_work", label: "Too similar to past work", message: "This looks too much like your earlier submissions, so try a new concept or format." },
  { id: "does_not_follow_brief", label: "Doesn’t follow the brief", message: "The video is missing key points, the call to action or required elements from the brief." },
  { id: "audio_quality", label: "Audio quality", message: "The sound is muffled, has background noise or is too quiet." },
  { id: "brand_or_compliance_issue", label: "Brand or compliance issue", message: "There are other brands’ logos in frame, claims we can’t make or something off-brand." },
] as const;

export type MediaRejectionReason = (typeof MEDIA_REJECTION_PROMPTS)[number]["id"];
