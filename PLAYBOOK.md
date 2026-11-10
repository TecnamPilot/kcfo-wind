# Playbook: how the KCFO Runway Wind app was built

This is the "canon": the step-by-step method used to build the KCFO crosswind app on 9–10 November 2026, written so the same method can be repeated for the next app. Think of it as a checklist in a POH: Part A says what happened, Part B is the checklist to follow next time, and Part C lists the mistakes to avoid.

**Result:** a weather app at <https://tecnampilot.github.io/kcfo-wind/> that runs on Azat's iPhone home screen and loads live KCFO weather.
**Total time:** about 53 minutes from the first message (23:20) to the confirmed iPhone screenshot (00:13). About 25 of those minutes went into the app itself, and about 20 went into getting it onto the iPhone. Part C explains how to cut the second part to about 5 minutes.

---

## Terms used in this playbook

| Term | Plain meaning | Aviation comparison |
|---|---|---|
| **HTML file** | A text file that a web browser (Safari, Chrome) reads and turns into a page with buttons and colors. Our whole app is one HTML file of 749 lines (47 KB). | Like a single kneeboard card: everything you need is on one sheet, nothing to assemble. |
| **JavaScript** | The programming language written inside the HTML file. It does the math (crosswind components) and downloads the weather. | The E6B inside the card. |
| **API** | "Application Programming Interface": a web address that returns raw data for programs instead of a page for people. Example: `api.weather.gov/stations/KCFO/observations/latest` returns the latest KCFO METAR as data. | Like the ATIS frequency: a fixed place you tune to and always get the same kind of information. |
| **CORS** | "Cross-Origin Resource Sharing". A permission that a data server gives (or refuses) to web pages from other websites. If a server refuses, the browser blocks our page from reading its data, even though the data is public. | Like a fuel truck that only fuels aircraft on its FBO's account. The fuel exists, but you can't get it from that truck. |
| **Repository (repo)** | A project folder on GitHub that keeps every version of the files. Ours is `TecnamPilot/kcfo-wind`. | The aircraft's logbook plus the parts shelf: every change is recorded with a date. |
| **Commit / push** | A commit is one saved change with a note. A push sends commits from the computer to GitHub. | A logbook entry, then filing it with the shop. |
| **Branch** | A parallel copy of the files where changes are made before they join the main copy (`main`). | Doing maintenance on a spare part before installing it. |
| **Pull request (PR)** | A request to merge a branch into `main`, which the owner reviews and approves. | The return-to-service sign-off. |
| **GitHub Pages** | GitHub's free web hosting. It turns `index.html` in a public repo into a website at `https://<username>.github.io/<repo>/`. | A free tie-down spot for your app on the internet. |
| **Claude GitHub App** | A permission you install on GitHub so Claude can write files into the repos you choose. | Giving the mechanic a key to one hangar, not all of them. |
| **Mock / sample data** | Made-up but realistic weather (for example a typed-in METAR) used to test the app when the real server can't be reached. | Practicing an engine-out in the simulator before doing it in the airplane. |
| **Home Screen web app** | A website saved to the iPhone home screen with its own icon. It opens full screen like a normal app and always shows the latest version. | — |

---

## Part A. What happened, step by step

### Phase 1. Understand the request (minutes 0–1)

1. **The request** was: pull the KCFO weather, show headwind and crosswind for runways 08, 26, 17 and 35, color the best runway green, color unsafe runways red for a Tecnam P2008 TC with a Rotax 914, and grey for the rest.
2. **Azat added two rules** in the first message: use the POH numbers, and the pilot (Azat) makes the go/no-go decision. So the app was labeled *advisory only* from the start.
3. **Azat also asked a research question:** how does tailwind affect the crosswind maximum? This was answered in the same delivery (see Phase 2).

### Phase 2. Verify every number from a primary source (minutes 1–5)

A "primary source" is the original document (the POH, the FAA chart supplement), not a forum or a blog.

4. **Aircraft limits from the POH** ([P2008 TC Flight Manual, Rotax 914](https://www.deltaaviation.com/wp-content/uploads/2019/06/POH_P2008_914UL.pdf)):
   - Demonstrated crosswind **15 kt** (§2.1.24 and §4.5). "Demonstrated" means a test pilot showed it can be done; it is not a structural limit. The app compares the **gust** value against 15 kt, following EASA's crosswind bulletin SIB 2014-20.
   - **No tailwind limit** in the POH. Only a distance correction: **+15 m (50 ft) per knot of tailwind, −5 m (16 ft) per knot of headwind** (§4.6, §4.7). So the app's tailwind limit is a *personal* setting, default 10 kt, with 5 kt suggested.
   - Short final speed **52 KIAS**, flap limit 68 KIAS.
5. **Airport data from FAA/AirNav:** runway headings in **true** degrees, because METAR and TAF winds are given from true north. ATIS/AWOS voice reports use magnetic. At KCFO the difference (magnetic variation) is 8° East:

   | Runway | Magnetic | True | Used in the app |
   |---|---|---|---|
   | 08 | 083° | 091° | 091° |
   | 26 | 263° | 271° | 271° |
   | 17 | 172° | 180° | 180° |
   | 35 | 352° | 360° | 360° |

   Both runways are 8,000 ft (2,438 m) asphalt; field elevation 5,515 ft.
6. **Weather sources checked:**
   - KCFO has a METAR but **no TAF**. The nearest TAF is KDEN, 6 nm northwest.
   - aviationweather.gov **refuses CORS**, so a web page can't read it directly. metar-taf.com shows the same NWS data.
   - **api.weather.gov (National Weather Service) allows CORS.** It provides the KCFO observation, the KDEN TAF text, and an hourly gridded forecast for the KCFO location. That became the data source.
7. **The tailwind research** was answered with numbers: tailwind doesn't change the 15 kt crosswind figure on paper or in the air, but on the ground it raises touchdown groundspeed (about 69 kt with a 10 kt tailwind versus 49 kt with a 10 kt headwind, so (69 ÷ 49)² ≈ 2 times the energy to stop), makes the rudder lose airflow sooner, and makes weathervaning pull the nose the wrong way.

### Phase 3. Build the app as one HTML file (minutes 5–8, first version)

8. **Why one file:** no installation, no server, no build tools. It opens in any browser, can be emailed or copied to a phone, and is easy for a later Claude to edit.
9. **What the file contains:**
   - A list of the 4 runways with their true headings.
   - Wind math for each runway: headwind = wind × cos(angle), crosswind = wind × sin(angle), where the angle is between the wind direction and the runway heading. Calculated for both the steady wind and the gust.
   - Color rules: **red** if the crosswind (using the gust) is over 15 kt or the tailwind (using the gust) is over the personal limit. If the wind is variable (for example "VRB" or "250V310"), every direction in the range is checked and the worst one counts. **Green** for the safe runway with the most headwind (runways within 1 kt of the best are all green). If the wind is under 3 kt, every safe runway is green. **Grey** for any other safe runway.
   - Readers ("parsers") for METAR and TAF text, plus a **paste box**, so a METAR copied from metar-taf.com works even without internet access to the NWS.
   - A status line showing ✓ or ✗ for each data source, so the user can see at a glance whether live weather loaded.
   - Settings (crosswind and tailwind limits) saved in the browser so they survive a restart.
10. **Delivery:** the file was saved to the project library (`kcfo-crosswind/kcfo-crosswind.html`) and attached to the reply, with the POH quotes and the tailwind answer.

### Phase 4. Add what the pilot really needs (minutes 17–21, second version)

11. Azat wanted more situational awareness. The question asked was: *what matters for a 2-hour local VFR flight in a P2008 departing 07:00?* Added:
    - **Flight window:** departure time + duration (default 07:00 + 2 h), with runway colors at departure and at return, and the worst wind anywhere in the window (including gusts and TEMPO groups in the TAF).
    - **Density altitude** at departure and return.
    - **Sun glare** warning when the sun is less than 25° high and within 30° of a runway direction (at 07:00 in November the sun is 3° high at 116° true, 25° off runway 08).
    - **Frost** warning at 2 °C or colder; **fog** warning when temperature and dew point are within 2 °C.
    - **Gust factor:** add half the gust spread to 52 KIAS.
    - NWS alerts, SIGMETs, nearby METARs (KDEN, KBKF, KAPA, KBJC), and the aviation section of the Denver forecast discussion.
    - One-tap links to aviationweather.gov for what can't be loaded (PIREPs, G-AIRMETs, winds aloft) and to 1800wxbrief.com for the official briefing and NOTAMs.

### Phase 5. Test (during phases 3 and 4)

12. **The limitation:** Claude's cloud computer can't reach weather servers (the network blocks them). So the app was tested with **sample data**: realistic METARs and TAFs fed in by hand to check the parsing, the math and the colors.
13. **The real test was on Azat's phone.** Each reply asked Azat to check the status line for three ✓ marks. The screenshot at 00:12 showed all three: KCFO METAR, KDEN TAF, NWS hourly. That is the moment the app counted as working.

### Phase 6. Put it on the iPhone (minutes 32–53)

14. **Azat asked** "How to get this application on my iPhone?" Opening the HTML file from the iPhone Files app doesn't work well, because its preview doesn't load live weather. So the plan was a free website plus a home-screen icon.
15. **Azat created a public repo** `kcfo-wind` at github.com/new. Public is required because free GitHub Pages only works on public repos. The app contains no personal information.
16. **Azat installed the Claude GitHub App** with **Only select repositories → kcfo-wind**. (On the first try only another repo was selected, so it had to be edited and saved again.)
17. **Claude uploaded three files** to `main`: `index.html` (the app, renamed), `apple-touch-icon.png` (180 × 180 pixel icon for the iPhone home screen), and `README.md`.
18. **Azat turned on GitHub Pages:** repo Settings → Pages → Build and deployment → Source "Deploy from a branch" → Branch **main**, folder **/ (root)** → Save. Claude's GitHub App isn't allowed to change this setting, so the owner must click it.
19. **Waited about 2 minutes.** Before that, the address returns "404 Not Found". That is normal.
20. **On the iPhone:** open the address in **Safari** (Chrome on iPhone can't add to the home screen) → Share → **Add to Home Screen** → Add.
21. **Confirmed live:** the iPhone screenshot showed three ✓ marks and tomorrow's 07:00 forecast (230° at 7 kt gusting 11).

### Phase 7. Remember

22. The verified facts (POH limits, runway headings, data sources, hosting address, how to update) were saved to project memory, so a future thread doesn't have to ask again. **To update the app:** change `index.html` and push it to `main`. The iPhone gets the new version the next time the app opens.

---

## Part B. The checklist for the next app

Use this for any similar app: a tool that pulls public data and shows a decision aid on a phone.

### 1. Before building (ask in the first reply)

- [ ] **What decision does the app help with, and who makes the final call?** (Here: runway choice; the pilot decides. Label the app "advisory".)
- [ ] **Where will it be used?** iPhone, laptop, or both. **If a phone is involved, plan the website from the start** (step 4 below).
- [ ] **Which numbers come from an official document?** Get the document (POH, chart supplement, FAR/AIM) and quote section numbers.
- [ ] **Which numbers are personal choices?** (Here: tailwind limit.) Make them settings in the app, with a suggested default and the reason for it.

### 2. Verify the data (before writing any code)

- [ ] Read limits from the **primary source** and write down the section number.
- [ ] Watch for **true vs magnetic** and **units** (kt vs mph, m vs ft, local time vs UTC "Z").
- [ ] For each data source, check: (a) does it exist for this location (KCFO has no TAF), (b) **does it allow CORS** so a web page can read it, (c) is there an official alternative that does. For US weather, **api.weather.gov allows it; aviationweather.gov does not**.
- [ ] Always add a **paste box** fallback so the app works when the data source is down.

### 3. Build

- [ ] **One self-contained HTML file.** No outside libraries unless really needed.
- [ ] Show a **status line** with ✓/✗ per data source, so a failed download is never mistaken for calm weather.
- [ ] Use **three colors with fixed meanings** (green best, grey acceptable, red over a limit) and show the numbers next to the color.
- [ ] Save user settings in the browser.
- [ ] Test with **sample data**, including edge cases: calm, variable, gusts over the limit, exactly at the limit, wind on a diagonal.
- [ ] Add the 180 × 180 `apple-touch-icon.png` and the `apple-mobile-web-app` tags so it looks like an app on the iPhone.

### 4. Publish to the phone (about 5 minutes if done in this order)

Send the user **all owner-only steps in one message**, numbered:

- [ ] **(User)** github.com/new → name → **Public** → Create repository.
- [ ] **(User)** [Install the Claude GitHub App](https://github.com/apps/claude/installations/select_target) → your account → **Only select repositories** → pick the new repo → Install (or Save, if it is already installed for other repos; keep those selected).
- [ ] **(Claude)** Push `index.html`, `apple-touch-icon.png`, `README.md` to `main`.
- [ ] **(User)** Repo Settings → Pages → Deploy from a branch → **main** / **(root)** → Save.
- [ ] Wait **2 minutes**. A 404 before then is normal.
- [ ] **(User, iPhone)** **Safari** → type the address in the **address bar** (not the Google search box) → Share → Add to Home Screen → Add.
- [ ] **(User)** Send a screenshot of the status line. The app is done only when live data shows ✓ on the real device.

### 5. After

- [ ] Save verified facts, the web address, and "how to update" to project memory.
- [ ] Future changes: edit `index.html`, push to `main`, wait about 1 minute.

---

## Part C. Lessons learned

1. **Ask "phone or computer?" in the first reply.** The iPhone question came 32 minutes in, and publishing then took 20 minutes of back-and-forth (wrong repo selected in the GitHub App, a stale browser tab, a plugin page opened by mistake, the address typed into Google's search box). With the Part B step 4 message sent once, up front, it takes about 5 minutes.
2. **Give owner-only steps as one numbered list with the exact link.** Each extra round of "now click this" cost 1–3 minutes and a photo. When Azat asked for "step by step", the 7-step list worked on the first try.
3. **A 404 for the first 2 minutes after turning on Pages is normal.** Say so in advance so it doesn't look like a failure.
4. **The cloud computer can't reach weather servers, so the user's device is the real test.** Build the ✓/✗ status line in from the start and ask for one screenshot.
5. **Check CORS before choosing a data source,** not after. The source the user names (metar-taf.com, aviationweather.gov) may be readable only by people, not by a web page. The NWS API carried the same official data.
6. **Separate POH limits from personal minimums.** The POH has a 15 kt *demonstrated* crosswind and *no* tailwind limit. Mixing a personal number into "POH limits" would be wrong; making it a labeled setting is honest and useful.
7. **True vs magnetic is the classic trap.** METAR/TAF = true; ATIS/AWOS and runway numbers = magnetic. Using magnetic headings with a true wind would put every component off by 8° at KCFO.
8. **"Advisory only" is not a formality.** The pilot in command decides. The app shows its numbers next to its colors so the pilot can check its reasoning, just as you'd cross-check an E6B result against a crosswind chart.
