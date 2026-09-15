# Automated Demo Video of the Website

Goal: a 4-6 minute demo video that records the real website automatically, with an English voiceover, using a demo user whose data is fake (no real account, no real broker, no real money).

## What the video will show (in order)

1. Landing page and tagline
2. Signup with OTP, then login
3. PIN create and PIN unlock
4. Profile page and referral page
5. Wallet recharge (demo payment, fake success)
6. Broker connection (demo broker, connected state)
7. Symbol selection and confirmation
8. Strategy settings: stop loss, target, trailing stop loss
9. Backtest run with a positive sample result
10. Live signal appearing on the dashboard
11. Order placed, position opening, profit running live
12. Position monitor: partial exit / exit, logs
13. Orders and logs sections
14. Journal and support sections
15. Closing screen with the website name

## Demo mode (fake data, nothing real)

A demo mode is switched on only when the site is opened with a special demo link. In that mode:

- A demo user is signed in instantly, no real signup needed (the signup and OTP screens are still shown and accept demo values, so the flow looks real).
- Signals, orders, positions, P&L, logs, journal entries, wallet balance, referral stats, backtest results and broker connection all come from a fixed fake dataset that is generated in the browser.
- No order is ever sent to a broker, no payment is charged, nothing is written to the real database.
- Normal visitors are unaffected — without the demo link the site behaves exactly as today.

Profit numbers, win counts and timings in the demo dataset are illustrative sample data, and the video will carry a short on-screen note saying so.

## How the video is produced

1. A script opens the site in an automatic browser at 1920x1080 in demo mode and clicks through the whole flow above at a natural pace, with short pauses so each screen is readable. No manual clicking.
2. The browser session is recorded as video.
3. An English narration script (about 700-800 words) is written for the 15 steps, turned into speech, and lined up with the matching scene.
4. Narration, a light background music bed, a title card and a closing card are combined with the recording into one MP4.
5. Final file is delivered as a download, and can also be placed on the website's landing page if you want.

Rerunning the script regenerates the video, so the demo can be refreshed whenever the UI changes.

## Technical notes

- Demo mode: `?demo=1` sets a session flag; a `DemoDataProvider` wraps the app and intercepts the data hooks/services (reusing `MockDataService`) to return a deterministic seeded dataset. Order placement, wallet recharge and broker connect are short-circuited to fake success responses.
- Recording: Playwright Chromium with `record_video`, fixed viewport 1920x1080, scripted waits keyed to visible elements (not blind sleeps) so the run is stable.
- Live-feel scenes (P&L ticking, signal arriving) are driven by the demo dataset advancing on a timer.
- Voiceover: Lovable AI text-to-speech (`openai/gpt-4o-mini-tts`), one clip per scene, chunked by scene.
- Assembly: ffmpeg concat of scene segments + audio mix + title/end cards; output H.264 MP4, ~4-6 minutes.
- Nothing in the live trading, broker or payment code paths is changed; demo mode only adds a branch that returns fake data.

## Open item

If any screen cannot be reached without a real broker or real payment, that scene will use the demo dataset's pre-connected state instead of the live flow, and the narration will still describe the step.
