# r-guesser

A retro-arcade browser game for building intuition about correlation: look at a scatter plot and guess **Pearson's r**.

## How to play
- In this game r always runs from **0** to **0.99**.
- Type only the **digits after "0."** and press **Enter**: `6` means 0.60, `63` means 0.63, `05` means 0.05.
- Off by more than **0.10** → you lose a ♥. Within **0.02** → you win a ♥ back (max 5).
- Survive as many rounds as you can. From round 4, watch for **tricky rounds** (outliers, curves, clusters, fans) that show where r can mislead.
- Retro sound effects for every moment; press **M** (or the speaker button) to mute.

## Run locally
Open `index.html` in a browser. No build step needed.

## Play online
**https://ophirbetser.github.io/r-guesser/**

Every push to `main` deploys automatically with GitHub Actions to GitHub Pages
(see `.github/workflows/deploy.yml`).
