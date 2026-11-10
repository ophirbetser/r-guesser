# r-guesser

A browser game for building intuition about correlation: look at a scatter plot and guess **Pearson's r**.

## How to play
- Type your guess between **−1** and **1** (for example `0.63` or `-.4`) and press **Enter**.
- Off by more than **0.10** → you lose a life. Within **0.02** → you win a life back (max 5).
- Survive as many rounds as you can. Watch out for **tricky rounds**: outliers, curves, clusters and fans that show where r can mislead.

## Run locally
Open `index.html` in a browser. No build step needed.

## Play online
**https://ophirbetser.github.io/r-guesser/**

Every push to `main` deploys automatically with GitHub Actions to GitHub Pages
(see `.github/workflows/deploy.yml`).
