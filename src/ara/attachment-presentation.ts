export type ReviewCaption = { source: string; seconds: number; label: string; name: string };

// Only automatic video-review metadata is presentation data; normal JSON stays visible.
export function reviewPresentation(value: string) {
    const reviews: ReviewCaption[] = [];
    const seen: Record<string, boolean> = {};
    let text = String(value || "").replace(/(?:^|\n)[ \t]*Правка видео:[ \t]*(\/[^\r\n]+\.(?:mp4|mov|webm|mkv|m4v))[ \t]*\r?\nТаймкод:[ \t]*(\d+(?:\.\d+)?)[ \t]*с\. Рисунок на кадре приложен\.[ \t]*(?=\r?\n|$)/gi, function(_: string, source: string, seconds: string) {
        const at = Number(seconds);
        const key = source + ":" + at;
        if (isFinite(at) && !seen[key]) {
            seen[key] = true;
            const minutes = Math.floor(at / 60);
            const rest = (at % 60).toFixed(3).padStart(6, "0");
            reviews.push({source: source, seconds: at, label: minutes + ":" + rest, name: source.split("/").pop() || "Видео"});
        }
        return "\n";
    });
    text = text.replace(/^[ \t]*\/[^\r\n]*\/Ara-reviews\/review-[a-z0-9-]+\.json[ \t]*\r?$/gmi, "");
    return {text: text.replace(/\n{3,}/g, "\n\n").trim(), reviews: reviews};
}
