# Publishing test media

Created 18 November 2026. These are synthetic test assets, not customer content.

| File | Use |
| --- | --- |
| `01-coffee.jpg` | First photo in a carousel, image accessibility text and people tags |
| `02-fresh-start.jpg` | Second photo; use Move earlier / Move later to check ordering |
| `03-small-moments.mp4` | 12-second portrait video with gentle motion, transitions and English narration; 1080 × 1350, 30 fps, H.264/AAC, fast-start MP4 |
| `04-cover.jpg` | Matching video cover, approximately 234 KB, comfortably below 2 MB |
| `05-english.srt` | Three timed English subtitle cues matching the video's narration; upload separately in LinkedIn's Closed captions field |

All three JPGs are RGB, 1122 × 1402 pixels. The video uses a 4:5 portrait frame to fit a mixed carousel and also exercise the single-video publishing paths. Instagram may crop previews; use the separate cover control when testing a single Reel. The subtitle file is deliberately not burned into the video, so caption switching can be tested.

## Quick test combinations

- Instagram mixed carousel: photo 1 → video → photo 2. Do not attach a separate cover to a carousel.
- Instagram single Reel: video + cover. In a separate test, remove the cover and choose a cover frame.
- Instagram Story: one photo or the video, without the separate cover or a first comment.
- YouTube: video + cover; initially use Unlisted visibility for your test.
- LinkedIn: video + cover + English SRT. For an image post, use the photos separately from the video.

The photos and cover were generated with the built-in image tool and converted to JPG locally. The voice uses offline Microsoft Zira Desktop, and FFmpeg assembles the video. No OpenAI API image credits or paid voice API were used. Use appropriate AI-content disclosures when testing publication.

## Generation prompts

1. **Photo 1:** “Use case: photorealistic-natural. Create one beautiful editorial photograph for a social media upload test. Portrait 4:5 framing. A handmade cream ceramic cup of coffee on a light oak table beside a closed sage-green notebook, warm morning window light, subtle shadows, realistic textures, calm minimal composition. No people, no logos, no writing, no watermark. Keep the important objects in the central area. This should look like a real high quality lifestyle photograph.”
2. **Photo 2:** “Use case: photorealistic-natural. Create one editorial lifestyle photograph for a social media upload test, portrait 4:5 framing. A small healthy green succulent in a simple cream ceramic pot and an open blank cream notebook on a light oak tabletop by a sunlit window. Soft warm morning light, believable leaf detail, natural shadows, sage-green and oatmeal tones, calm minimal composition. No people, no writing, no logos, no watermark. Important objects centered. Real high quality photography.”
3. **Cover:** “Use case: ads-marketing. Create a polished vertical 4:5 video cover image for a short calm lifestyle clip. Warm sunlit light-oak tabletop with cream ceramic coffee cup and small green succulent, understated cream and sage palette. Upper center has large extremely clear tasteful dark charcoal serif typography with exact words on two lines: ‘Small moments.’ and ‘Fresh starts.’ A small restrained uppercase line beneath reads exactly ‘A MOMENT TO RESET’. Keep text and subjects well within the central safe area, spacious editorial composition, realistic photography background with enough soft quiet area behind text for effortless readability. No brand, no watermark, no extra text.”

`manifest.json` records file sizes and SHA-256 checksums. The companion ZIP contains this same kit, with no database backup or credentials.
