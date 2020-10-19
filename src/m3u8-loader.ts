import fetch from "node-fetch";

export default async function getMediaUrl(m3u8File: string, mediaType: string): Promise<string> {
    mediaType = mediaType.toLowerCase();
    if (m3u8File.toLowerCase().endsWith("." + mediaType)) {
        return m3u8File;
    }
    return new Promise((resolve, fail) => {
        fetch(m3u8File)
            .then(res => res.text())
            .then(body => {
                for (const line of body.split("\n")) {
                    const cleaned = line.replace(/#.*/g, "").trim();
                    if (cleaned.toLowerCase().endsWith("." + mediaType)) {
                        resolve(cleaned);
                        return;
                    } else {
                        if (cleaned.toLowerCase().includes(".m3u")) {
                            resolve(getMediaUrl(cleaned, mediaType))
                            return;
                        }
                    }
                }
                fail("No valid url with the wanted type");
            })
            .catch(err => {
                console.error(err);
                fail(err);
            });
    });
}